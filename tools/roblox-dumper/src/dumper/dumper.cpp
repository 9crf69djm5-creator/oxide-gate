#include "dumper.h"
#include "bridge/bridge.h"
#include "process/memory/memory.h"
#include "stages/data_model/data_model.h"
#include "stages/instance/instance.h"
#include "stages/player/player.h"
#include "stages/property_descriptors/property_descriptors.h"
#include "stages/registry.h"
#include "stages/value/value.h"
#include "stages/visual_engine/visual_engine.h"
#include "stages/workspace/workspace.h"
#include <cstring>
#include <fstream>
#include <spdlog/spdlog.h>
#include <thread>
#include <vector>

namespace dumper {

    Dumper::~Dumper() {}

    auto Dumper::start() -> bool {
        spdlog::info("Dumper starting.\n");

        bool attach_ok = true;

        if (!stages::visual_engine::dump()) {
            spdlog::error("Failed to dump VisualEngine");
            return false;
        }

        if (!stages::data_model::dump_ptr()) {
            spdlog::error("Failed to find DataModel pointer");
            return false;
        }

        if (!stages::instance::dump()) {
            spdlog::error("Failed to dump Instance");
            return false;
        }

        g_data_model = roblox::Instance(g_data_model_addr);

        if (!stages::value::dump()) {
            spdlog::error("Failed to dump Value offset (need dump place with TestValue)");
            spdlog::warn("Continuing in attach-lite mode — open tools/roblox-dumper/rblx place for full coverage");
            attach_ok = false;
        }

        bool bridge_ok = false;
        if (attach_ok) {
            bridge_ok = bridge::g_bridge.initialize();
            if (!bridge_ok) {
                spdlog::error("Failed to initialize bridge (dump place StringValues missing)");
                spdlog::warn("Continuing in attach-lite mode");
            }
        }

        if (bridge_ok) {
            if (!stages::data_model::dump()) {
                spdlog::error("Failed to dump DataModel");
            }

            if (!stages::player::dump()) {
                spdlog::error("Failed to dump Player");
            }

            stages::workspace::dump();
        } else {
            // Still try Workspace RTTI path without bridge game info.
            g_workspace = g_data_model.find_first_child_of_class("Workspace");
            g_lighting = g_data_model.find_first_child_of_class("Lighting");
            if (g_workspace)
                stages::workspace::dump();
        }

        g_data_model = roblox::Instance(g_data_model_addr);
        if (!g_lighting)
            g_lighting = g_data_model.find_first_child_of_class("Lighting");
        if (!g_workspace)
            g_workspace = g_data_model.find_first_child_of_class("Workspace");

        if (!stages::property_descriptors::dump()) {
            spdlog::error("Failed to dump PropertyDescriptors");
        }

        std::vector<std::thread> threads;
        for (const auto& stage : stages::g_stage_registry) {
            threads.emplace_back([&stage]() {
                if (!stage.dump()) {
                    spdlog::error("Failed to dump {}", stage.name);
                }
            });
        }

        for (auto& thread : threads) {
            thread.join();
        }

        const bool has_attach = g_dumper.get_offset("FakeDataModel", "Pointer") &&
                                g_dumper.get_offset("FakeDataModel", "RealDataModel") &&
                                g_dumper.get_offset("VisualEngine", "Pointer");
        if (!has_attach) {
            spdlog::error("Attach-critical offsets missing — dump failed");
            return false;
        }

        if (!bridge_ok) {
            spdlog::warn("Attach-critical offsets OK; full theo-coverage dump requires the included rblx place");
        }

        return true;
    }

    auto Dumper::add_offset(const std::string& namespace_name, const std::string& offset_name,
                            size_t offset, const std::string& comment, FieldType type) -> void {
        std::lock_guard<std::mutex> lock(m_offset_mutex);
        // Avoid duplicate names in the same namespace (aliases / retries).
        for (const auto& e : m_offsets[namespace_name]) {
            if (e.name == offset_name)
                return;
        }
        m_offsets[namespace_name].push_back({offset_name, offset, comment, type});
        spdlog::info("Added offset: {}::{} = 0x{:X}", namespace_name, offset_name, offset);
    }

    auto Dumper::add_enum(const std::string& enum_name, const std::string& entry_name, int value)
        -> void {
        std::lock_guard<std::mutex> lock(m_offset_mutex);
        m_enums[enum_name].push_back({entry_name, value});
    }

    auto Dumper::set_namespace_comment(const std::string& namespace_name,
                                       const std::string& comment) -> void {
        std::lock_guard<std::mutex> lock(m_offset_mutex);
        m_namespace_comments[namespace_name] = comment;
    }

    auto Dumper::get_offset(const std::string& namespace_name, const std::string& offset_name) const
        -> std::optional<size_t> {
        std::lock_guard<std::mutex> lock(m_offset_mutex);
        auto it = m_offsets.find(namespace_name);
        if (it == m_offsets.end()) {
            return std::nullopt;
        }

        for (const auto& entry : it->second) {
            if (entry.name == offset_name) {
                return entry.offset;
            }
        }

        return std::nullopt;
    }

} // namespace dumper
