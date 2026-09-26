#include "workspace.h"
#include "dumper/dumper.h"
#include "dumper/macros.h"
#include <process/helpers/helpers.h>
#include <process/rtti/rtti.h>
#include <spdlog/spdlog.h>

namespace dumper::stages::workspace {

    auto dump() -> bool {
        const auto camera = process::Rtti::find(dumper::g_workspace->get_address(), "Camera@RBX");
        if (!camera) {
            spdlog::error("Failed to find CurrentCamera offset in Workspace");
            return false;
        }

        dumper::g_dumper.add_offset("Workspace", "CurrentCamera", *camera, "", FieldType::Pointer);

        FIND_AND_ADD_OFFSET(dumper::g_workspace->get_address(), Workspace, float, ReadOnlyGravity,
                            196.2f, 0x1000, 0x4, FieldType::Float);

        const auto result = process::helpers::find_offset_in_pointer<float>(
            dumper::g_workspace->get_address(), 196.2f, 0x800, 0x400, 0x8, 0x4);

        if (!result) {
            spdlog::error("Failed to dump World and World Gravity in Workspace");
            return false;
        }

        const auto [world, gravity] = *result;
        g_dumper.add_offset("Workspace", "World", world, "", FieldType::Pointer);
        g_dumper.add_offset("World", "Gravity", gravity, "", FieldType::Float);

        const auto world_addr =
            process::Memory::read<uintptr_t>(g_workspace->get_address() + world);

        if (!world_addr) {
            spdlog::error("Failed to read World offset in Workspace");
            return false;
        }

        FIND_AND_ADD_OFFSET(*world_addr, World, float, WorldSteps, 240.0f, 0x1000, 0x4,
                            FieldType::Float);

        std::optional<size_t> primitives_offset;

        for (size_t offset = 0; offset < 0x1000; offset += 0x8) {
            const auto array_ptr = process::Memory::read<uintptr_t>(*world_addr + offset);
            if (!array_ptr || *array_ptr == 0)
                continue;

            const auto check_slot = [&](size_t slot) -> bool {
                const auto primitive_ptr = process::Memory::read<uintptr_t>(*array_ptr + slot);
                if (!primitive_ptr || *primitive_ptr == 0)
                    return false;

                const auto names = process::Rtti::get_all_names(*primitive_ptr);
                return std::ranges::any_of(names, [](const auto& name) {
                    return name.find("Primitive@RBX") != std::string::npos;
                });
            };

            if (check_slot(0x0) && check_slot(0x8)) {
                primitives_offset = offset;
                break;
            }
        }

        if (!primitives_offset) {
            spdlog::error("Failed to find Primitives offset in World");
            return false;
        }

        g_dumper.add_offset("World", "Primitives", *primitives_offset, "", FieldType::Pointer);

        for (size_t offset = 0; offset < 0x400; offset += 0x8) {
            const auto air_props = process::Memory::read<uintptr_t>(*world_addr + offset);

            const auto global_wind_offset = process::helpers::find_vec_offset<glm::vec3>(
                *air_props, glm::vec3(100.2f, 102.f, 105.4f), 0x200);

            if (global_wind_offset) {
                g_dumper.add_offset("World", "AirProperties", offset, "", FieldType::Pointer);
                g_dumper.add_offset("AirProperties", "GlobalWind", *global_wind_offset, "",
                                    FieldType::Vector3);
                FIND_AND_ADD_OFFSET(*air_props, AirProperties, float, AirDensity, 9.67f, 0x200, 0x4,
                                    FieldType::Float);
            }
        }

        return true;
    }
} // namespace dumper::stages::workspace
