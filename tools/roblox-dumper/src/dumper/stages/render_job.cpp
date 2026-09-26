#include "dumper/dumper.h"
#include "dumper/stages/registry.h"
#include "process/memory/memory.h"
#include "process/process.h"
#include "process/rtti/rtti.h"
#include <spdlog/spdlog.h>

namespace dumper::stages::render_job {

    auto dump() -> bool {
        const auto ts_ptr = dumper::g_dumper.get_offset("TaskScheduler", "Pointer");
        const auto job_start_off = dumper::g_dumper.get_offset("TaskScheduler", "JobStart");
        const auto job_name_off = dumper::g_dumper.get_offset("TaskScheduler", "JobName");
        if (!ts_ptr || !job_start_off || !job_name_off) {
            spdlog::error("render_job: TaskScheduler offsets unavailable");
            return false;
        }

        const uintptr_t base = process::g_process.get_module_base();
        auto ts = process::Memory::read<uintptr_t>(base + *ts_ptr);
        if (!ts || !*ts) {
            spdlog::error("render_job: TaskScheduler null");
            return false;
        }

        auto job_start = process::Memory::read<uintptr_t>(*ts + *job_start_off);
        auto job_end = process::Memory::read<uintptr_t>(*ts + *job_start_off + 0x8);
        if (!job_start || !job_end || *job_start >= *job_end) {
            spdlog::error("render_job: job list invalid");
            return false;
        }

        uintptr_t render_job = 0;
        for (uintptr_t ptr = *job_start; ptr < *job_end; ptr += 0x8) {
            auto job = process::Memory::read<uintptr_t>(ptr);
            if (!job || *job < 0x10000)
                continue;
            auto name = process::Memory::read_sso_string(*job + *job_name_off);
            if (name && *name == "RenderJob") {
                render_job = *job;
                break;
            }
        }

        if (!render_job) {
            spdlog::error("render_job: RenderJob not found in TaskScheduler");
            return false;
        }

        if (auto fake = process::Rtti::find(render_job, "DataModel@RBX")) {
            dumper::g_dumper.add_offset("RenderJob", "FakeDataModel", *fake, "", FieldType::Pointer);
            auto fake_ptr = process::Memory::read<uintptr_t>(render_job + *fake);
            if (fake_ptr && *fake_ptr) {
                if (auto real = process::Rtti::find(*fake_ptr, "DataModel@RBX"))
                    dumper::g_dumper.add_offset("RenderJob", "RealDataModel", *real, "",
                                                FieldType::Pointer);
            }
        }

        if (auto rv = process::Rtti::find(render_job, "RenderView@Graphics@RBX")) {
            dumper::g_dumper.add_offset("RenderJob", "RenderView", *rv, "", FieldType::Pointer);
        }

        // RunService HeartbeatTask often sits near known services when present.
        if (dumper::g_data_model.is_valid()) {
            if (auto rs = dumper::g_data_model.find_first_child_of_class("RunService")) {
                if (auto hb = process::Rtti::find(rs->get_address(), "HeartbeatItem@RBX")) {
                    dumper::g_dumper.add_offset("RunService", "HeartbeatTask", *hb, "",
                                                FieldType::Pointer);
                } else if (auto hb2 = process::Rtti::find(rs->get_address(), "Task@RBX")) {
                    dumper::g_dumper.add_offset("RunService", "HeartbeatTask", *hb2, "",
                                                FieldType::Pointer);
                }
            }
            if (auto uis = dumper::g_data_model.find_first_child_of_class("UserInputService")) {
                if (auto wis = process::Rtti::find(uis->get_address(), "WindowInputState@RBX")) {
                    dumper::g_dumper.add_offset("UserInputService", "WindowInputState", *wis, "",
                                                FieldType::Pointer);
                    auto wis_ptr = process::Memory::read<uintptr_t>(uis->get_address() + *wis);
                    if (wis_ptr && *wis_ptr) {
                        if (auto tb =
                                process::Rtti::find(*wis_ptr, "TextBox@RBX")) {
                            dumper::g_dumper.add_offset("WindowInputState", "CurrentTextBox", *tb,
                                                        "", FieldType::Pointer);
                        }
                    }
                }
            }
        }

        return dumper::g_dumper.get_offset("RenderJob", "RenderView").has_value() ||
               dumper::g_dumper.get_offset("RenderJob", "FakeDataModel").has_value();
    }

} // namespace dumper::stages::render_job

REGISTER_STAGE(render_job)
