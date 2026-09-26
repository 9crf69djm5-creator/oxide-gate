#include "config.h"
#include "dumper/dumper.h"
#include "logger/logger.h"
#include "process/process.h"
#include "writer/struct_writer.h"
#include "writer/writer.h"
#include <Windows.h>
#include <winhttp.h>
#include <chrono>
#include <filesystem>
#include <format>
#include <fstream>
#include <iostream>
#include <sstream>
#include <spdlog/spdlog.h>
#include <string>

#pragma comment(lib, "winhttp.lib")

namespace {

struct UploadConfig {
    std::wstring host;
    INTERNET_PORT port = 443;
    bool https = true;
    std::wstring path = L"/api/admin/offsets";
    std::string admin_secret;
};

auto trim(std::string s) -> std::string {
    while (!s.empty() && (s.front() == ' ' || s.front() == '\t' || s.front() == '\r'))
        s.erase(s.begin());
    while (!s.empty() && (s.back() == ' ' || s.back() == '\t' || s.back() == '\r'))
        s.pop_back();
    return s;
}

auto load_ini_value(const std::filesystem::path& ini, const std::string& key) -> std::string {
    std::ifstream in(ini);
    if (!in)
        return {};
    std::string line;
    const std::string prefix = key + "=";
    while (std::getline(in, line)) {
        line = trim(line);
        if (line.empty() || line[0] == '#' || line[0] == ';')
            continue;
        if (line.rfind(prefix, 0) == 0)
            return trim(line.substr(prefix.size()));
    }
    return {};
}

auto parse_api_url(const std::string& url, UploadConfig& cfg) -> bool {
    if (url.empty())
        return false;
    std::string u = url;
    cfg.https = true;
    cfg.port = 443;
    if (u.rfind("https://", 0) == 0) {
        u = u.substr(8);
        cfg.https = true;
        cfg.port = 443;
    } else if (u.rfind("http://", 0) == 0) {
        u = u.substr(7);
        cfg.https = false;
        cfg.port = 80;
    }
    const auto slash = u.find('/');
    std::string hostport = slash == std::string::npos ? u : u.substr(0, slash);
    std::string path = slash == std::string::npos ? "/api/admin/offsets" : u.substr(slash);
    if (path == "/" || path.empty())
        path = "/api/admin/offsets";
    else if (path.find("/api/admin/offsets") == std::string::npos) {
        if (path.back() == '/')
            path.pop_back();
        path += "/api/admin/offsets";
    }
    const auto colon = hostport.find(':');
    if (colon != std::string::npos) {
        cfg.port = static_cast<INTERNET_PORT>(std::stoi(hostport.substr(colon + 1)));
        hostport = hostport.substr(0, colon);
    }
    cfg.host.assign(hostport.begin(), hostport.end());
    cfg.path.assign(path.begin(), path.end());
    return !cfg.host.empty();
}

auto load_upload_config() -> UploadConfig {
    UploadConfig cfg;
    const auto cwd = std::filesystem::current_path();
    const auto exe_dir = []() -> std::filesystem::path {
        wchar_t buf[MAX_PATH]{};
        GetModuleFileNameW(nullptr, buf, MAX_PATH);
        return std::filesystem::path(buf).parent_path();
    }();

    std::filesystem::path ini;
    for (const auto& dir : {exe_dir, cwd}) {
        for (const auto& name : {"oxide_dumper.ini", "oxide_auth.ini"}) {
            const auto candidate = dir / name;
            if (std::filesystem::exists(candidate)) {
                ini = candidate;
                break;
            }
        }
        if (!ini.empty())
            break;
    }

    std::string api = "https://oxide-gate-api.onrender.com";
    if (!ini.empty()) {
        const auto from_ini = load_ini_value(ini, "api");
        if (!from_ini.empty())
            api = from_ini;
        cfg.admin_secret = load_ini_value(ini, "adminSecret");
        if (cfg.admin_secret.empty())
            cfg.admin_secret = load_ini_value(ini, "ADMIN_SECRET");
    }
    if (const char* env_api = std::getenv("OXIDE_API")) {
        if (env_api[0])
            api = env_api;
    }
    if (const char* env_sec = std::getenv("OXIDE_ADMIN_SECRET")) {
        if (env_sec[0])
            cfg.admin_secret = env_sec;
    } else if (const char* env_sec2 = std::getenv("ADMIN_SECRET")) {
        if (env_sec2[0])
            cfg.admin_secret = env_sec2;
    }

    parse_api_url(api, cfg);
    return cfg;
}

auto http_post_json(const UploadConfig& cfg, const std::string& body) -> bool {
    if (cfg.host.empty() || cfg.admin_secret.empty())
        return false;

    HINTERNET session = WinHttpOpen(L"OXIDE-Dumper/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session)
        return false;
    WinHttpSetTimeouts(session, 10000, 10000, 30000, 60000);

    HINTERNET connect = WinHttpConnect(session, cfg.host.c_str(), cfg.port, 0);
    if (!connect) {
        WinHttpCloseHandle(session);
        return false;
    }

    DWORD flags = cfg.https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET request = WinHttpOpenRequest(connect, L"POST", cfg.path.c_str(), nullptr,
                                           WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return false;
    }

    std::wstring headers = L"Content-Type: application/json\r\nX-Admin-Secret: ";
    headers.append(cfg.admin_secret.begin(), cfg.admin_secret.end());

    const BOOL ok = WinHttpSendRequest(request, headers.c_str(), static_cast<DWORD>(-1),
                                       (LPVOID)body.data(), static_cast<DWORD>(body.size()),
                                       static_cast<DWORD>(body.size()), 0) &&
                    WinHttpReceiveResponse(request, nullptr);

    DWORD status = 0;
    DWORD status_size = sizeof(status);
    if (ok) {
        WinHttpQueryHeaders(request, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                            WINHTTP_HEADER_NAME_BY_INDEX, &status, &status_size,
                            WINHTTP_NO_HEADER_INDEX);
    }

    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return ok && status >= 200 && status < 300;
}

auto try_upload_offsets(const std::filesystem::path& json_path) -> void {
    if (!std::filesystem::exists(json_path)) {
        spdlog::warn("Upload skipped: {} not found", json_path.string());
        return;
    }
    const auto cfg = load_upload_config();
    if (cfg.admin_secret.empty()) {
        spdlog::info("Upload skipped: set adminSecret in oxide_dumper.ini (or ADMIN_SECRET env) "
                     "to push offsets to the site.");
        return;
    }

    std::ifstream in(json_path);
    std::stringstream ss;
    ss << in.rdbuf();
    const std::string body = ss.str();
    if (body.empty()) {
        spdlog::warn("Upload skipped: empty JSON");
        return;
    }

    std::string host(cfg.host.begin(), cfg.host.end());
    spdlog::info("Uploading offsets to https://{}{} ...", host,
                 std::string(cfg.path.begin(), cfg.path.end()));
    if (http_post_json(cfg, body)) {
        spdlog::info("Offsets uploaded — site/API /api/offsets updated.");
    } else {
        spdlog::error("Offset upload failed. Check adminSecret and API URL.");
    }
}

auto resolve_output_dir(int argc, char** argv) -> std::filesystem::path {
    if (argc >= 2 && argv[1] && argv[1][0]) {
        return std::filesystem::path(argv[1]);
    }
    wchar_t buf[MAX_PATH]{};
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    return std::filesystem::path(buf).parent_path();
}

} // namespace

auto main(int argc, char** argv) -> int {
    logger::initialize();

    const auto title = std::format("{} {}", PROJECT_NAME, PROJECT_VERSION);
    const auto out_dir = resolve_output_dir(argc, argv);
    std::error_code ec;
    std::filesystem::create_directories(out_dir, ec);
    std::filesystem::current_path(out_dir, ec);

    spdlog::info("{} created by jonah/nopjo (OXIDE integrated)", title);
    spdlog::info("Output directory: {}", out_dir.string());

    if (!process::g_process.attach("RobloxPlayerBeta.exe")) {
        MessageBoxA(nullptr,
                    "Failed to attach to Roblox. Join an experience, then rerun OxideDumper.exe.",
                    title.c_str(), MB_OK | MB_ICONERROR);
        return 1;
    }

    spdlog::info("Attached to Roblox. PID: {}\n", process::g_process.get_pid());

    const auto start_time = std::chrono::steady_clock::now();
    const bool ok = dumper::g_dumper.start();
    const auto end_time = std::chrono::steady_clock::now();
    const auto elapsed =
        std::chrono::duration_cast<std::chrono::milliseconds>(end_time - start_time);

    spdlog::info("Finished in {} ms ({:.2f} seconds) success={}", elapsed.count(),
                 elapsed.count() / 1000.0, ok);

    // Always write whatever we collected (attach-critical may succeed even if bridge place fails).
    dumper::writer::g_header_writer.write("offsets", elapsed);
    dumper::writer::g_json_writer.write("offsets", elapsed);
    dumper::writer::g_python_writer.write("offsets", elapsed);
    dumper::writer::g_csharp_writer.write("offsets", elapsed);
    dumper::writer::g_struct_writer.write("structs", elapsed);

    logger::print_error_summary();

    const auto json_path = out_dir / "offsets.json";
    if (std::filesystem::exists(json_path)) {
        try_upload_offsets(json_path);
        spdlog::info("Wrote {}", json_path.string());
    } else {
        spdlog::error("No offsets.json produced");
        return 2;
    }

    if (!ok) {
        spdlog::warn("Dump completed with errors (place/bridge stages may have failed). "
                     "Attach RVAs are still in offsets.json if VisualEngine succeeded.");
        return 0;
    }
    return 0;
}
