#include "dumper/dumper.h"
#include "dumper/stages/registry.h"
#include "process/helpers/zydis.h"
#include "process/memory/memory.h"
#include "process/process.h"
#include "roblox/offsets.h"
#include <Zydis/Zydis.h>
#include <optional>
#include <spdlog/spdlog.h>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace dumper::stages::descriptor_props {
namespace {

    // Theo-style coverage checklist: class -> property names to extract from reflection.
    // Values come from the live client via GetSet disassembly — never from a third-party dump.
    const std::unordered_map<std::string, std::vector<std::string>> kChecklist = {
        {"Sound",
         {"SoundId", "RollOffMaxDistance", "RollOffMinDistance", "PlaybackSpeed", "Volume",
          "SoundGroup", "IsPlaying", "Looped"}},
        {"Beam",
         {"Brightness", "LightEmission", "LightInfluence", "Texture", "TextureLength", "TextureSpeed",
          "ZOffset", "Attachment0", "Attachment1", "CurveSize0", "CurveSize1", "Width0", "Width1"}},
        {"ParticleEmitter",
         {"Brightness", "LightEmission", "LightInfluence", "Texture", "ZOffset", "Lifetime", "Rate",
          "Rotation", "RotSpeed", "Speed", "SpreadAngle", "Acceleration", "Drag", "TimeScale",
          "VelocityInheritance"}},
        {"SurfaceAppearance",
         {"AlphaMode", "Color", "ColorMap", "EmissiveMaskContent", "EmissiveStrength",
          "EmissiveTint", "MetalnessMap", "NormalMap", "RoughnessMap"}},
        {"SpawnLocation",
         {"AllowTeamChangeOnTouch", "Enabled", "Neutral", "ForcefieldDuration", "TeamColor"}},
        {"Clothing", {"Template", "Color3"}},
        {"ClickDetector", {"MaxActivationDistance", "MouseIcon"}},
        {"DragDetector",
         {"ReferenceInstance", "MaxActivationDistance", "MaxDragAngle", "MaxDragTranslation",
          "MinDragAngle", "MinDragTranslation", "ActivatedCursorIcon", "CursorIcon", "MaxForce",
          "MaxTorque", "Responsiveness"}},
        {"Attachment", {"Position"}},
        {"Weld", {"Part0", "Part1"}},
        {"WeldConstraint", {"Part0", "Part1"}},
        {"UnionOperation", {"AssetId"}},
        {"AnimationTrack", {"Animation", "Animator", "Speed", "TimePosition", "Looped", "IsPlaying"}},
        {"Animator", {"ActiveAnimations"}},
        {"BlurEffect", {"Size", "Enabled"}},
        {"ColorCorrectionEffect", {"Brightness", "Contrast", "TintColor", "Enabled"}},
        {"ColorGradingEffect", {"TonemapperPreset", "Enabled"}},
        {"DepthOfFieldEffect",
         {"FocusDistance", "FarIntensity", "NearIntensity", "InFocusRadius", "Enabled"}},
        {"SunRaysEffect", {"Intensity", "Spread", "Enabled"}},
        {"BloomEffect", {"Enabled"}},
        {"Seat", {"Occupant"}},
        {"StatsItem", {"Value"}},
        {"RunService", {"HeartbeatFPS"}},
        {"UserInputService", {"WindowInputState"}},
        {"PlayerMouse", {"Workspace", "Icon"}},
        {"Script", {"GUID", "Hash"}},
        {"LocalScript", {"GUID", "Hash"}},
        {"ModuleScript", {"GUID", "Hash"}},
        {"Team", {"BrickColor", "TeamColor"}},
        {"Camera", {"CameraType", "ViewportSize", "FieldOfView", "CameraSubject"}},
        {"Humanoid",
         {"DisplayName", "MoveDirection", "FloorMaterial", "Jump", "PlatformStand", "Sit",
          "HumanoidRootPart", "MoveToPoint"}},
        {"Player",
         {"LocalPlayer", "ModelInstance", "CameraMode", "MaxZoomDistance", "MinZoomDistance",
          "Mouse"}},
        {"DataModel", {"ScriptContext", "PlaceVersion", "PrimitiveCount"}},
        {"Workspace", {"DistributedGameTime"}},
        {"Lighting", {"GlobalShadows", "GeographicLatitude"}},
        {"Tool", {"TextureId"}},
        {"MeshPart", {"Texture", "MeshId"}},
        {"ProximityPrompt", {"KeyCode", "GamepadKeyCode"}},
        {"GuiObject", {"Visible", "BackgroundTransparency", "BackgroundColor3", "BorderColor3",
                       "LayoutOrder", "ZIndex", "Rotation"}},
        {"Decal", {"Texture"}},
        {"Texture", {"Texture"}},
    };

    auto find_instance_of_class(const roblox::Instance& root, const std::string& class_name,
                                int depth = 0) -> std::optional<roblox::Instance> {
        if (depth > 8)
            return std::nullopt;
        auto cn = root.get_class_name();
        if (cn && *cn == class_name)
            return root;
        for (const auto& child : root.get_children()) {
            if (auto hit = find_instance_of_class(child, class_name, depth + 1))
                return hit;
        }
        return std::nullopt;
    }

    auto find_prop_entry(uintptr_t list_start, size_t name_off, const std::string& target)
        -> uintptr_t {
        uintptr_t current = list_start;
        for (int i = 0; i < 800; i++) {
            auto entry = process::Memory::read<uintptr_t>(current);
            if (!entry || !*entry)
                break;
            auto name_ptr = process::Memory::read<uintptr_t>(*entry + name_off);
            if (name_ptr && *name_ptr > 0x10000) {
                auto name = process::Memory::read_sso_string(*name_ptr);
                if (name && *name == target)
                    return *entry;
            }
            current += 0x10;
        }
        return 0;
    }

    auto looks_like_code(uintptr_t addr) -> bool {
        if (addr < 0x10000)
            return false;
        const auto base = process::g_process.get_module_base();
        if (!base)
            return false;
        // Heuristic: within module image window.
        return addr >= base && addr < base + 0x20000000ull;
    }

    auto extract_member_offset_from_getter(uintptr_t getter) -> std::optional<size_t> {
        auto buffer = process::Memory::read_bytes(getter, 0x80);
        if (buffer.size() < 8)
            return std::nullopt;

        ZydisDecoder decoder;
        ZydisDecoderInit(&decoder, ZYDIS_MACHINE_MODE_LONG_64, ZYDIS_STACK_WIDTH_64);

        size_t offset = 0;
        while (offset < buffer.size()) {
            ZydisDecodedInstruction insn;
            ZydisDecodedOperand ops[ZYDIS_MAX_OPERAND_COUNT];
            if (!ZYAN_SUCCESS(ZydisDecoderDecodeFull(&decoder, buffer.data() + offset,
                                                     buffer.size() - offset, &insn, ops))) {
                offset++;
                continue;
            }

            const bool is_load =
                insn.mnemonic == ZYDIS_MNEMONIC_MOV || insn.mnemonic == ZYDIS_MNEMONIC_MOVZX ||
                insn.mnemonic == ZYDIS_MNEMONIC_MOVSX || insn.mnemonic == ZYDIS_MNEMONIC_MOVSXD ||
                insn.mnemonic == ZYDIS_MNEMONIC_MOVSS || insn.mnemonic == ZYDIS_MNEMONIC_MOVSD ||
                insn.mnemonic == ZYDIS_MNEMONIC_MOVAPS || insn.mnemonic == ZYDIS_MNEMONIC_MOVUPS ||
                insn.mnemonic == ZYDIS_MNEMONIC_LEA;

            if (is_load) {
                for (size_t i = 0; i < insn.operand_count; i++) {
                    const auto& op = ops[i];
                    if (op.type != ZYDIS_OPERAND_TYPE_MEMORY)
                        continue;
                    if (!op.mem.disp.has_displacement)
                        continue;
                    const auto base = op.mem.base;
                    if (base != ZYDIS_REGISTER_RCX && base != ZYDIS_REGISTER_RDX &&
                        base != ZYDIS_REGISTER_R8 && base != ZYDIS_REGISTER_RAX &&
                        base != ZYDIS_REGISTER_RBX)
                        continue;
                    const int64_t disp = op.mem.disp.value;
                    if (disp >= 0x20 && disp < 0x4000)
                        return static_cast<size_t>(disp);
                }
            }

            if (insn.mnemonic == ZYDIS_MNEMONIC_RET || insn.mnemonic == ZYDIS_MNEMONIC_INT3)
                break;

            offset += insn.length;
        }
        return std::nullopt;
    }

    auto resolve_getter_from_getset(uintptr_t getset) -> std::optional<uintptr_t> {
        // GetSetImpl layouts vary; try common slots for the Get function pointer.
        for (size_t off : {0x8ull, 0x10ull, 0x0ull, 0x18ull}) {
            auto fn = process::Memory::read<uintptr_t>(getset + off);
            if (fn && looks_like_code(*fn))
                return *fn;
        }
        return std::nullopt;
    }

    auto dump_class_props(const roblox::Instance& inst, const std::string& class_name,
                          const std::vector<std::string>& props) -> int {
        size_t class_desc_off = roblox::offsets::Instance::ClassDescriptor;
        if (!class_desc_off) {
            auto o = dumper::g_dumper.get_offset("Instance", "ClassDescriptor");
            if (!o)
                return 0;
            class_desc_off = *o;
        }
        auto class_desc = process::Memory::read<uintptr_t>(inst.get_address() + class_desc_off);
        if (!class_desc || !*class_desc)
            return 0;

        size_t prop_list_off = roblox::offsets::ClassDescriptor::PropertyDescriptors;
        if (!prop_list_off) {
            auto o = dumper::g_dumper.get_offset("ClassDescriptor", "PropertyDescriptors");
            if (!o)
                return 0;
            prop_list_off = *o;
        }

        auto prop_list = process::Memory::read<uintptr_t>(*class_desc + prop_list_off);
        if (!prop_list || !*prop_list)
            return 0;

        size_t name_off = roblox::offsets::Descriptor::Name;
        if (!name_off) {
            auto n = dumper::g_dumper.get_offset("Descriptor", "Name");
            if (!n)
                return 0;
            name_off = *n;
        }

        size_t getset_off = 0x90;
        if (auto g = dumper::g_dumper.get_offset("PropertyDescriptor", "GetSetImpl"))
            getset_off = *g;

        int added = 0;
        for (const auto& prop_name : props) {
            if (dumper::g_dumper.get_offset(class_name, prop_name))
                continue;

            uintptr_t desc = find_prop_entry(*prop_list, name_off, prop_name);
            if (!desc)
                continue;

            auto getset = process::Memory::read<uintptr_t>(desc + getset_off);
            if (!getset || !*getset)
                continue;

            auto getter = resolve_getter_from_getset(*getset);
            if (!getter)
                continue;

            auto mem = extract_member_offset_from_getter(*getter);
            if (!mem)
                continue;

            dumper::g_dumper.add_offset(class_name, prop_name, *mem, "descriptor/GetSet");
            ++added;
        }
        return added;
    }

    // Decal/Texture map into theo's Textures namespace.
    void emit_texture_aliases() {
        if (auto d = dumper::g_dumper.get_offset("Decal", "Texture"))
            dumper::g_dumper.add_offset("Textures", "Decal_Texture", *d, "alias");
        if (auto t = dumper::g_dumper.get_offset("Texture", "Texture"))
            dumper::g_dumper.add_offset("Textures", "Texture_Texture", *t, "alias");
    }

} // namespace

    auto dump() -> bool {
        if (!dumper::g_data_model.is_valid()) {
            spdlog::error("descriptor_props: DataModel unavailable");
            return false;
        }

        int total = 0;
        std::unordered_set<std::string> missing_instances;

        for (const auto& [class_name, props] : kChecklist) {
            auto inst = find_instance_of_class(dumper::g_data_model, class_name);
            if (!inst) {
                // Prefer Lighting children for post-effects when present.
                if (dumper::g_lighting) {
                    inst = dumper::g_lighting->find_first_child_of_class(class_name);
                }
            }
            if (!inst && dumper::g_workspace) {
                inst = find_instance_of_class(*dumper::g_workspace, class_name);
            }
            if (!inst) {
                missing_instances.insert(class_name);
                continue;
            }
            total += dump_class_props(*inst, class_name, props);
        }

        emit_texture_aliases();

        // Theo-compatible naming aliases (same values, alternate keys).
        if (auto v = dumper::g_dumper.get_offset("TaskScheduler", "MaxFps"))
            dumper::g_dumper.add_offset("TaskScheduler", "MaxFPS", *v, "theo alias");
        if (auto v = dumper::g_dumper.get_offset("Humanoid", "WalkSpeed"))
            dumper::g_dumper.add_offset("Humanoid", "Walkspeed", *v, "theo alias");
        if (auto v = dumper::g_dumper.get_offset("Humanoid", "WalkSpeedCheck"))
            dumper::g_dumper.add_offset("Humanoid", "WalkspeedCheck", *v, "theo alias");
        if (auto v = dumper::g_dumper.get_offset("World", "WorldSteps"))
            dumper::g_dumper.add_offset("World", "worldStepsPerSec", *v, "theo alias");
        if (auto v = dumper::g_dumper.get_offset("ProximityPrompt", "KeyboardKeyCode"))
            dumper::g_dumper.add_offset("ProximityPrompt", "KeyCode", *v, "theo alias");
        if (auto v = dumper::g_dumper.get_offset("Value", "Value")) {
            dumper::g_dumper.add_offset("Misc", "Value", *v, "theo alias");
            dumper::g_dumper.add_offset("Misc", "StringLength", 0x10, "SSO size field");
        }
        if (auto v = dumper::g_dumper.get_offset("Instance", "Name"))
            dumper::g_dumper.add_offset("Instance", "ClassName", *v, "name container sibling");
        if (auto v = dumper::g_dumper.get_offset("RenderView", "SkyboxValid"))
            dumper::g_dumper.add_offset("RenderView", "SkyValid", *v, "theo alias");

        spdlog::info("descriptor_props: added {} offsets ({} classes had no live instance)", total,
                     missing_instances.size());
        if (!missing_instances.empty()) {
            std::string list;
            for (const auto& n : missing_instances) {
                if (!list.empty())
                    list += ", ";
                list += n;
            }
            spdlog::warn("descriptor_props: no instance for: {}", list);
        }
        return true;
    }

} // namespace dumper::stages::descriptor_props

REGISTER_STAGE(descriptor_props)
