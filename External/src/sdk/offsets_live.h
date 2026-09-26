#pragma once
#include "offsets.h"
#include <windows.h>
#include <winhttp.h>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iterator>
#include <string>
#include <vector>

#pragma comment(lib, "winhttp.lib")

// Runtime overlay for attach-critical RVAs. Seeded from offsets.h; refreshed from
// (1) local offsets.json beside Oxide.exe / dumper output, then
// (2) OXIDE gate-api /api/offsets, then
// (3) public imtheo dump as last-resort fallback.
namespace Offsets::Live {
inline std::uintptr_t FakeDataModelPointer = Offsets::FakeDataModel::Pointer;
inline std::uintptr_t RealDataModel = Offsets::FakeDataModel::RealDataModel;
inline std::uintptr_t VisualEnginePointer = Offsets::VisualEngine::Pointer;
inline std::string DumpVersion;

namespace detail {
inline bool ParseDecimalField(const std::string& json, const char* cls, const char* field,
                              std::uintptr_t& out) {
    const std::string classKey = std::string("\"") + cls + "\":{";
    const size_t c = json.find(classKey);
    if (c == std::string::npos)
        return false;
    const size_t body = c + classKey.size();
    size_t end = json.find("},\"", body);
    if (end == std::string::npos)
        end = json.find('}', body);
    if (end == std::string::npos)
        end = body + 512;

    // Prefer nested {"decimal":N} (OXIDE API) then bare number (jonah/imtheo).
    const std::string fieldKey = std::string("\"") + field + "\":";
    const size_t f = json.find(fieldKey, body);
    if (f == std::string::npos || f > end)
        return false;
    const char* p = json.c_str() + f + fieldKey.size();
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r')
        ++p;
    if (*p == '{') {
        const std::string slice(p, json.c_str() + end);
        const size_t d = slice.find("\"decimal\":");
        if (d == std::string::npos)
            return false;
        char* term = nullptr;
        const unsigned long long v = std::strtoull(slice.c_str() + d + 10, &term, 10);
        if (!term || v == 0)
            return false;
        out = static_cast<std::uintptr_t>(v);
        return true;
    }
    char* term = nullptr;
    const unsigned long long v = std::strtoull(p, &term, 10);
    if (!term || term == p || v == 0)
        return false;
    out = static_cast<std::uintptr_t>(v);
    return true;
}

inline void ParseVersion(const std::string& json) {
    const char* keys[] = {"\"robloxVersion\":\"", "\"Roblox Version\":\"",
                          "\"roblox_version\":\""};
    for (const char* key : keys) {
        const size_t v = json.find(key);
        if (v == std::string::npos)
            continue;
        const size_t s = v + std::strlen(key);
        const size_t e = json.find('"', s);
        if (e != std::string::npos) {
            DumpVersion = json.substr(s, e - s);
            return;
        }
    }
}

inline bool ApplyAttachFields(const std::string& json, const char* label) {
    if (json.empty())
        return false;
    // Accept jonah ("offsets"), imtheo ("Offsets"), or OXIDE ("namespaces").
    if (json.find("\"FakeDataModel\"") == std::string::npos)
        return false;

    ParseVersion(json);

    std::uintptr_t fake = 0, real = 0, ve = 0;
    const bool gotFake = ParseDecimalField(json, "FakeDataModel", "Pointer", fake);
    const bool gotReal = ParseDecimalField(json, "FakeDataModel", "RealDataModel", real);
    const bool gotVe = ParseDecimalField(json, "VisualEngine", "Pointer", ve);
    if (!gotFake || !gotReal || !gotVe) {
        printf("[*] live offsets partial (%s) — keeping built-in attach RVAs\n", label);
        return false;
    }

    FakeDataModelPointer = fake;
    RealDataModel = real;
    VisualEnginePointer = ve;
    if (!DumpVersion.empty())
        Offsets::ClientVersion = DumpVersion;

    printf("[+] live offsets ready via %s (%s) fake=0x%llX real=0x%llX ve=0x%llX\n", label,
           DumpVersion.empty() ? "unknown" : DumpVersion.c_str(),
           static_cast<unsigned long long>(FakeDataModelPointer),
           static_cast<unsigned long long>(RealDataModel),
           static_cast<unsigned long long>(VisualEnginePointer));
    return true;
}

inline std::string ReadLocalFile(const std::wstring& path) {
    std::ifstream in(path, std::ios::binary);
    if (!in)
        return {};
    return std::string((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
}

inline std::wstring ExeDir() {
    wchar_t buf[MAX_PATH]{};
    GetModuleFileNameW(nullptr, buf, MAX_PATH);
    std::wstring p(buf);
    const size_t slash = p.find_last_of(L"\\/");
    if (slash != std::wstring::npos)
        p.resize(slash + 1);
    return p;
}

inline std::string HttpGet(const wchar_t* host, INTERNET_PORT port, const wchar_t* path,
                           bool https) {
    std::string out;
    HINTERNET session = WinHttpOpen(L"OXIDE/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                    WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session)
        return out;
    WinHttpSetTimeouts(session, 8000, 8000, 8000, 12000);
    HINTERNET connect = WinHttpConnect(session, host, port, 0);
    if (!connect) {
        WinHttpCloseHandle(session);
        return out;
    }
    DWORD flags = https ? WINHTTP_FLAG_SECURE : 0;
    HINTERNET request = WinHttpOpenRequest(connect, L"GET", path, nullptr, WINHTTP_NO_REFERER,
                                           WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request) {
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return out;
    }
    if (!WinHttpSendRequest(request, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0,
                            0, 0) ||
        !WinHttpReceiveResponse(request, nullptr)) {
        WinHttpCloseHandle(request);
        WinHttpCloseHandle(connect);
        WinHttpCloseHandle(session);
        return out;
    }
    for (;;) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(request, &avail) || avail == 0)
            break;
        std::vector<char> buf(avail);
        DWORD read = 0;
        if (!WinHttpReadData(request, buf.data(), avail, &read) || read == 0)
            break;
        out.append(buf.data(), read);
        if (out.size() > 4u * 1024 * 1024)
            break;
    }
    WinHttpCloseHandle(request);
    WinHttpCloseHandle(connect);
    WinHttpCloseHandle(session);
    return out;
}
} // namespace detail

inline bool Refresh() {
    const std::wstring dir = detail::ExeDir();
    const std::wstring locals[] = {
        dir + L"offsets.json",
        dir + L"dumps\\offsets.json",
        L"offsets.json",
    };
    for (const auto& path : locals) {
        const std::string json = detail::ReadLocalFile(path);
        if (detail::ApplyAttachFields(json, "local offsets.json"))
            return true;
    }

    // Prefer OXIDE hosted dump (updated by OxideDumper upload).
    {
        const std::string json =
            detail::HttpGet(L"oxide-gate-api.onrender.com", 443, L"/api/offsets", true);
        if (detail::ApplyAttachFields(json, "oxide-gate-api"))
            return true;
    }

    // Last resort: public third-party dump (checklist parity only; not preferred).
    {
        const std::string json =
            detail::HttpGet(L"offsets.imtheo.lol", 443, L"/offsets.json", true);
        if (detail::ApplyAttachFields(json, "imtheo"))
            return true;
    }

    printf("[*] live offsets unavailable — using built-in %s\n", Offsets::ClientVersion.c_str());
    return false;
}
} // namespace Offsets::Live
