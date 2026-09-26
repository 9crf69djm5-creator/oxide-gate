#include "dumper/dumper.h"
#include "dumper/stages/registry.h"
#include "process/helpers/helpers.h"
#include "process/helpers/zydis.h"
#include "process/memory/memory.h"
#include "process/rtti/rtti.h"
#include "process/xref/xref.h"
#include <spdlog/spdlog.h>

namespace dumper::stages::task_scheduler {

    static auto get_pointer() -> uintptr_t {
        const auto string_results =
            process::Memory::scan_string("ScriptContextTaskQueue", ".rdata");

        if (string_results.empty()) {
            spdlog::error("ScriptContextTaskQueue string not found");
            return 0;
        }

        for (const auto& string_addr : string_results) {
            const auto xrefs = process::g_xref.scan(string_addr);

            for (const auto& xref : xrefs) {
                auto result = process::helpers::zydis::resolve_rip_mov(xref, 0x100, 0x300);

                if (result) {
                    return *result - process::g_process.get_module_base();
                }
            }
        }

        spdlog::error("Failed to resolve TaskScheduler pointer");
        return 0;
    }

    static auto get_job_name_offset(uintptr_t task_sched, size_t job_start_offset)
        -> std::optional<size_t> {
        static const std::unordered_set<std::string> job_names = {
            "WorkspaceTaskQueue",
            "PerformanceControlCoordinatorV2Job",
            "NotifyAliveJob",
            "LuaGc",
            "WaitingHybridScriptsJob",
            "ClearUnusedLuaRefsJob",
            "LuauTelemetry",
            "DataModelCharacterTaskQueue",
            "TimerTickerJob",
            "MemoryPrioritizationJob",
            "PerformanceControlOrchestrator",
            "Write Marshalled",
            "Read Marshalled",
            "None Marshalled",
            "ThumbnailFetchJob",
            "Sound",
            "LogServiceJob",
            "HttpRbxApiJob",
            "Simulation",
            "Heartbeat",
            "AnalyticsServiceJob",
            "HumanoidParallelManagerTaskQueue",
            "AnimatorParallelManagerTaskQueue",
            "ScriptContextTaskQueue",
            "EventBroadcastrelayFireEventJob",
            "Video",
            "RenderJob",
            "Replicator ProcessPackets",
            "Network Quality Responder",
            "PreRenderJob",
            "SceneUpdaterTaskQueue",
            "SmoothClusterTaskQueue",
            "DummyClient Event Processor",
            "Network Disconnect Clean Up",
            "Allocate Bandwidth and Run Senders",
            "ScopeCheckCleanupJob",
            "AvatarCreationServiceJob",
            "Net PacketReceive",
            "Net Peer Send",
            "Net Peer Stats",
            "MegaReplicatorPPRTaskQueue",
            "MegaReplicatorTaskQueue",
            "DynamicTranslationSender_LocalizationService",
            "LocalizationTableAnalyticsSender_LocalizationService"};

        const auto job_start = process::Memory::read<uintptr_t>(task_sched + job_start_offset);
        const auto job_end = process::Memory::read<uintptr_t>(task_sched + job_start_offset + 0x8);

        if (!job_start || !job_end || *job_start >= *job_end)
            return std::nullopt;

        for (uintptr_t ptr = *job_start; ptr < *job_end; ptr += 0x8) {
            const auto job = process::Memory::read<uintptr_t>(ptr);
            if (!job || *job < 0x10000)
                continue;

            for (size_t offset = 0; offset < 0x1000; offset += 0x8) {
                auto str = process::Memory::read_sso_string(*job + offset);
                if (!str || str->empty())
                    continue;

                if (job_names.contains(*str)) {
                    return offset;
                }
            }
        }

        return std::nullopt;
    }

    auto dump() -> bool {
        const auto task_scheduler_ptr = get_pointer();
        if (!task_scheduler_ptr) {
            spdlog::error("Failed to find task scheduler pointer");
            return false;
        }

        g_dumper.add_offset("TaskScheduler", "Pointer", task_scheduler_ptr);

        const uintptr_t task_scheduler = *process::Memory::read<uintptr_t>(
            process::g_process.get_module_base() + task_scheduler_ptr);

        const auto job_start =
            process::Rtti::find_deref(task_scheduler, "Job@TaskScheduler@RBX", 0x1000);

        if (!job_start) {
            spdlog::error("Failed to find job start in task scheduler");
            return false;
        }

        g_dumper.add_offset("TaskScheduler", "JobStart", *job_start, "", FieldType::Pointer);
        g_dumper.add_offset("TaskScheduler", "JobEnd", *job_start + 0x8, "", FieldType::Pointer);

        const auto job_name = get_job_name_offset(task_scheduler, *job_start);
        if (!job_name) {
            spdlog::error("Failed to find job name offset");
            return false;
        }

        g_dumper.add_offset("TaskScheduler", "JobName", *job_name);

        const auto max_fps =
            process::helpers::find_offset<double>(task_scheduler, 1.0 / 60.0, 0x1000, 0x4);

        if (!max_fps) {
            spdlog::error("Failed to find MaxFps offset for task scheduler, make sure your Roblox "
                          "FPS is set to 60fps");
            return false;
        }

        g_dumper.add_offset("TaskScheduler", "MaxFps", *max_fps, "", FieldType::Double);

        return true;
    }

} // namespace dumper::stages::task_scheduler

REGISTER_STAGE(task_scheduler)
