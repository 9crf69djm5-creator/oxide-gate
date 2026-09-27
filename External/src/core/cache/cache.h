#pragma once
#include "../../../src/sdk/sdk.h"
#include "../globals/globals.h"
#include "../variables/variables.h"
#include "../keys/keys.h"
#include <vector>
#include <string>
#include <cstdint>
#include <utility>
#include <chrono>
#include <cstdio>
#include <algorithm>
#include <unordered_map>
#include <unordered_set>
#include <atomic>
#include <cmath>

namespace PlayerCache {
struct CachedPlayer {
    std::uintptr_t playerAddr = 0;
    std::uintptr_t characterAddr = 0;
    std::uintptr_t humanoidAddr = 0;
    std::uintptr_t rootPartAddr = 0;
    std::uintptr_t headAddr = 0;
    std::uintptr_t teamAddr = 0;
    std::string name;
    std::string displayName;
    std::int64_t userId = 0;
    std::string tool = "None";
    std::string teamName;
    RBX::Vec3 position{};
    float health = 0.0f;
    float maxHealth = 0.0f;
    float distance = 0.0f;
    bool isValid = false;
    bool isR6 = false;
    int role = 0; 
};



// Persistent role tracking - once detected as murderer/sheriff, stays that way
inline std::unordered_map<std::uintptr_t, int> roleCache;
inline int ScanRole(std::uintptr_t characterAddr) {
    if (!characterAddr) return 0;
    
    // Check if we already have a cached role (murderer/sheriff)
    auto cachedRole = roleCache.find(characterAddr);
    if (cachedRole != roleCache.end() && cachedRole->second != 0) {
        return cachedRole->second; // Return cached murderer/sheriff role
    }
    
    RBX::RbxInstance ch{characterAddr};
    int sawTool = 0;
    std::string firstTool;
    for (auto& child : ch.GetChildList()) {
        if (child.GetClass() != "Tool") continue;
        sawTool++;
        const std::string tn = child.GetName();
        if (firstTool.empty()) firstTool = tn;
        if (tn == "Knife") {
            roleCache[characterAddr] = 1; // Cache murderer role
            return 1;
        }
        if (tn == "Gun") {
            roleCache[characterAddr] = 2; // Cache sheriff role
            return 2;
        }
        for (auto& sub : child.GetChildList()) {
            const std::string sn = sub.GetName();
            if (sn == "KnifeServer") {
                roleCache[characterAddr] = 1; // Cache murderer role
                return 1;
            }
            if (sn == "GunServer") {
                roleCache[characterAddr] = 2; // Cache sheriff role
                return 2;
            }
        }
    }
    if (sawTool > 0) {
        static int dbgN = 0;
        if ((dbgN++ % 40) == 0)
            printf("[Role] char 0x%llx has %d tool(s) first='%s' -> innocent\n", (unsigned long long)characterAddr, sawTool, firstTool.c_str());
    }
    return 0;
}
inline void DbgRoleChange(std::uintptr_t playerAddr, const std::string& name, int oldR, int newR) {
    if (oldR == newR) return;
    const char* rn[3] = {"innocent", "MURDERER", "SHERIFF"};
    printf("[Role] %s -> %s\n", name.c_str(), rn[newR < 0 || newR > 2 ? 0 : newR]);
}

struct LimbAddrs {
    bool r6 = false;
    std::uintptr_t head = 0;
    std::uintptr_t hrp = 0;
    std::uintptr_t torso = 0;
    std::uintptr_t upperTorso = 0;
    std::uintptr_t lowerTorso = 0;
    std::uintptr_t lUpperArm = 0;
    std::uintptr_t lLowerArm = 0;
    std::uintptr_t lHand = 0;
    std::uintptr_t rUpperArm = 0;
    std::uintptr_t rLowerArm = 0;
    std::uintptr_t rHand = 0;
    std::uintptr_t lUpperLeg = 0;
    std::uintptr_t lLowerLeg = 0;
    std::uintptr_t lFoot = 0;
    std::uintptr_t rUpperLeg = 0;
    std::uintptr_t rLowerLeg = 0;
    std::uintptr_t rFoot = 0;
    std::uintptr_t lArm = 0;
    std::uintptr_t rArm = 0;
    std::uintptr_t lLeg = 0;
    std::uintptr_t rLeg = 0;
    std::uintptr_t humanoid = 0;
};

inline std::unordered_map<std::uintptr_t, LimbAddrs> limbCache;

inline const LimbAddrs& GetLimbs(std::uintptr_t characterAddr) {
    auto it = limbCache.find(characterAddr);
    // Incomplete scans (respawn / streaming) must not stick forever.
    if (it != limbCache.end() && it->second.hrp && it->second.humanoid && it->second.head)
        return it->second;
    if (it != limbCache.end())
        limbCache.erase(it);
    if (limbCache.size() >= 256)
        limbCache.clear();
    LimbAddrs l{};
    RBX::RbxInstance ch{characterAddr};
    auto head = ch.FindChild("Head");
    auto hrp = ch.FindChild("HumanoidRootPart");
    l.head = head.Addr;
    l.hrp = hrp.Addr;
    auto torso = ch.FindChild("Torso");
    l.r6 = torso.Addr != 0;
    l.torso = torso.Addr;
    if (l.r6) {
        l.lArm = ch.FindChild("Left Arm").Addr;
        l.rArm = ch.FindChild("Right Arm").Addr;
        l.lLeg = ch.FindChild("Left Leg").Addr;
        l.rLeg = ch.FindChild("Right Leg").Addr;
    } else {
        l.upperTorso = ch.FindChild("UpperTorso").Addr;
        l.lowerTorso = ch.FindChild("LowerTorso").Addr;
        l.lUpperArm = ch.FindChild("LeftUpperArm").Addr;
        l.lLowerArm = ch.FindChild("LeftLowerArm").Addr;
        l.lHand = ch.FindChild("LeftHand").Addr;
        l.rUpperArm = ch.FindChild("RightUpperArm").Addr;
        l.rLowerArm = ch.FindChild("RightLowerArm").Addr;
        l.rHand = ch.FindChild("RightHand").Addr;
        l.lUpperLeg = ch.FindChild("LeftUpperLeg").Addr;
        l.lLowerLeg = ch.FindChild("LeftLowerLeg").Addr;
        l.lFoot = ch.FindChild("LeftFoot").Addr;
        l.rUpperLeg = ch.FindChild("RightUpperLeg").Addr;
        l.rLowerLeg = ch.FindChild("RightLowerLeg").Addr;
        l.rFoot = ch.FindChild("RightFoot").Addr;
    }
    l.humanoid = ch.FindChildByClass("Humanoid").Addr;
    // Only cache complete limb sets so late-loading parts get another scan.
    if (l.hrp && l.humanoid && l.head) {
        auto res = limbCache.emplace(characterAddr, l);
        return res.first->second;
    }
    static thread_local LimbAddrs tmp;
    tmp = l;
    return tmp;
}

inline std::string GetWeaponFromViewModels(const std::string& playerName) {
    if (!Globals::workspace.Addr) return "None";
    auto viewModels = Globals::workspace.FindChild("ViewModels");
    if (!viewModels.Addr) return "None";
    for (auto& child : viewModels.GetChildList()) {
        const std::string className = child.GetClass();
        const std::string name = child.GetName();
        if (className == "Model" && name.rfind(playerName + " - ", 0) == 0) {
            size_t firstDash = name.find(" - ");
            if (firstDash != std::string::npos) {
                size_t secondDash = name.find(" - ", firstDash + 3);
                if (secondDash != std::string::npos)
                    return name.substr(firstDash + 3, secondDash - (firstDash + 3));
                return name.substr(firstDash + 3);
            }
        }
        if (name == "FirstPerson") {
            for (auto& fpChild : child.GetChildList()) {
                const std::string fpClass = fpChild.GetClass();
                const std::string fpName = fpChild.GetName();
                if (fpClass == "Model" && fpName.rfind(playerName + " - ", 0) == 0) {
                    size_t firstDash = fpName.find(" - ");
                    if (firstDash != std::string::npos) {
                        size_t secondDash = fpName.find(" - ", firstDash + 3);
                        if (secondDash != std::string::npos)
                            return fpName.substr(firstDash + 3, secondDash - (firstDash + 3));
                        return fpName.substr(firstDash + 3);
                    }
                }
            }
        }
    }
    return "None";
}

inline void PruneLimbs(const std::unordered_set<std::uintptr_t>& alive) {
    for (auto it = limbCache.begin(); it != limbCache.end();) {
        if (alive.find(it->first) == alive.end())
            it = limbCache.erase(it);
        else
            ++it;
    }
}

inline std::vector<CachedPlayer> players;
inline RBX::Vec3 localPlayerPos{};
inline std::uintptr_t localPlayerTeam = 0;
inline std::uintptr_t localRootPrim = 0;
// Full Players:GetChildren() count (includes local). Not ESP-ready size.
inline int onlineCount = 0;
inline std::atomic<bool> forceTopology{true};

inline RBX::Vec3 ReadPartPos(std::uintptr_t partAddr) {
    if (!partAddr)
        return {};
    const auto prim = memory->read<std::uintptr_t>(partAddr + Offsets::BasePart::Primitive);
    if (!prim)
        return {};
    return memory->read<RBX::Vec3>(prim + Offsets::Primitive::Position);
}

inline bool EspReadyFlags(const CachedPlayer& c) {
    if (!c.headAddr || !c.rootPartAddr || !c.humanoidAddr)
        return false;
    if (variables::ESP::deadCheck && c.health <= 0.f)
        return false;
    if (Keys::TeamCheckOn() && c.teamAddr && c.teamAddr == localPlayerTeam)
        return false;
    return true;
}

// Aim readiness: HRP+humanoid enough (head optional — aim falls back to HRP).
// Do NOT require ESP isValid (team/head), or online roster presence alone.
inline bool AimReadyFlags(const CachedPlayer& c) {
    if (!c.playerAddr || !c.rootPartAddr || !c.humanoidAddr)
        return false;
    if (variables::ESP::deadCheck && c.health <= 0.f)
        return false;
    return true;
}

// Live team read — prefer current values; never blank a good name on a failed GetName.
inline void RefreshTeam(CachedPlayer& c) {
    if (!c.playerAddr)
        return;
    const auto team = memory->read<std::uintptr_t>(c.playerAddr + Offsets::Player::Team);
    if (team) {
        c.teamAddr = team;
        const std::string n = RBX::RbxInstance(team).GetName();
        if (!n.empty())
            c.teamName = n;
    } else {
        c.teamAddr = 0;
        c.teamName.clear();
    }
}

// Live role from Knife/Gun tools. Skip only when there is no character (keep last role).
inline void RefreshRole(CachedPlayer& c) {
    if (!c.characterAddr)
        return;
    const int nr = ScanRole(c.characterAddr);
    DbgRoleChange(c.playerAddr, c.name, c.role, nr);
    c.role = nr;
}

inline void FillIdentity(CachedPlayer& c, RBX::RbxInstance& plr) {
    c.playerAddr = plr.Addr;
    c.name = plr.GetName();
    c.displayName = memory->read_string(plr.Addr + Offsets::Player::DisplayName);
    if (c.displayName.empty() || c.displayName == "Unknown")
        c.displayName = c.name;
    c.userId = memory->read<std::int64_t>(plr.Addr + Offsets::Player::UserId);
    RefreshTeam(c);
}

inline void ClearBody(CachedPlayer& c) {
    if (c.characterAddr)
        limbCache.erase(c.characterAddr);
    c.characterAddr = 0;
    c.humanoidAddr = 0;
    c.rootPartAddr = 0;
    c.headAddr = 0;
    c.position = {};
    c.distance = 0.f;
    c.isValid = false;
    c.tool = "None";
}

inline void Invalidate() {
    forceTopology.store(true);
    players.clear();
    localRootPrim = 0;
    localPlayerTeam = 0;
    limbCache.clear();
    onlineCount = 0;
}

inline void updateplayers() {
    if (!Globals::players.Addr || !Globals::localPlayer.Addr) {
        players.clear();
        localRootPrim = 0;
        onlineCount = 0;
        return;
    }

    using Clock = std::chrono::steady_clock;
    static auto lastTopo = Clock::now() - std::chrono::seconds(10);
    bool needTopo = forceTopology.exchange(false) || (Clock::now() - lastTopo >= std::chrono::milliseconds(25));

    // Fast path every call: live positions / health / team / role / ESP validity (do not drop entries).
    // Roles & team must refresh here — topology alone (~25ms) leaves ESP flags stale after job/team switch.
    {
        const auto lt = memory->read<std::uintptr_t>(Globals::localPlayer.Addr + Offsets::Player::Team);
        localPlayerTeam = lt;
    }
    if (localRootPrim) {
        const auto lp = memory->read<RBX::Vec3>(localRootPrim + Offsets::Primitive::Position);
        if (!(lp.X == 0.f && lp.Y == 0.f && lp.Z == 0.f))
            localPlayerPos = lp;
        else {
            localRootPrim = 0;
            needTopo = true;
        }
    }
    for (auto& c : players) {
        RefreshTeam(c);
        RefreshRole(c);
        if (!c.rootPartAddr || !c.humanoidAddr) {
            c.isValid = EspReadyFlags(c);
            continue;
        }
        const RBX::Vec3 rp = ReadPartPos(c.rootPartAddr);
        if (rp.X == 0.f && rp.Y == 0.f && rp.Z == 0.f) {
            ClearBody(c);
            needTopo = true;
            continue;
        }
        c.position = rp;
        const float dx = rp.X - localPlayerPos.X, dy = rp.Y - localPlayerPos.Y, dz = rp.Z - localPlayerPos.Z;
        c.distance = sqrtf(dx * dx + dy * dy + dz * dz);
        c.health = memory->read<float>(c.humanoidAddr + Offsets::Humanoid::Health);
        c.maxHealth = memory->read<float>(c.humanoidAddr + Offsets::Humanoid::MaxHealth);
        if (c.headAddr) {
            const RBX::Vec3 hp = ReadPartPos(c.headAddr);
            // One bad read must not wipe the bone forever — force a topology rescan instead.
            if (hp.X == 0.f && hp.Y == 0.f && hp.Z == 0.f)
                needTopo = true;
        } else if (c.characterAddr) {
            needTopo = true;
        }
        c.isValid = EspReadyFlags(c);
    }

    if (!needTopo)
        return;
    lastTopo = Clock::now();

    // Full Players folder rescan — keep everyone, even without a character yet.
    auto list = Globals::players.GetChildList();
    onlineCount = static_cast<int>(list.size());

    auto localChar = Globals::localPlayer.GetModelRef();
    localRootPrim = 0;
    if (localChar.Addr) {
        auto localRoot = localChar.FindChild("HumanoidRootPart");
        if (localRoot.Addr) {
            localRootPrim = localRoot.GetPrimitivePtr();
            const auto lp = localRoot.GetPos();
            if (!(lp.X == 0.f && lp.Y == 0.f && lp.Z == 0.f))
                localPlayerPos = lp;
        }
    }
    localPlayerTeam = memory->read<std::uintptr_t>(Globals::localPlayer.Addr + Offsets::Player::Team);

    std::unordered_set<std::uintptr_t> seenPlayers;
    std::unordered_set<std::uintptr_t> aliveChars;
    seenPlayers.reserve(list.size());
    aliveChars.reserve(list.size() + 1);
    if (localChar.Addr)
        aliveChars.insert(localChar.Addr);

    for (auto& plr : list) {
        if (plr.Addr == Globals::localPlayer.Addr)
            continue;
        seenPlayers.insert(plr.Addr);

        CachedPlayer* slot = nullptr;
        for (auto& c : players) {
            if (c.playerAddr == plr.Addr) {
                slot = &c;
                break;
            }
        }
        CachedPlayer fresh{};
        CachedPlayer& c = slot ? *slot : fresh;
        FillIdentity(c, plr);

        const auto character = plr.GetModelRef();
        if (!character.Addr) {
            ClearBody(c);
            if (!slot)
                players.push_back(std::move(c));
            continue;
        }
        aliveChars.insert(character.Addr);

        if (c.characterAddr != character.Addr) {
            if (c.characterAddr)
                limbCache.erase(c.characterAddr);
            c.characterAddr = character.Addr;
            c.humanoidAddr = 0;
            c.rootPartAddr = 0;
            c.headAddr = 0;
        }

        const auto& limbs = GetLimbs(character.Addr);
        // Role/tools can resolve before HRP — keep scanning so flags are not stuck on old job.
        RefreshRole(c);
        if (!limbs.hrp || !limbs.humanoid) {
            // Character exists but parts not ready — keep roster entry.
            c.isValid = false;
            if (!slot)
                players.push_back(std::move(c));
            continue;
        }

        c.humanoidAddr = limbs.humanoid;
        c.rootPartAddr = limbs.hrp;
        c.headAddr = limbs.head;
        c.isR6 = limbs.r6;
        c.health = memory->read<float>(limbs.humanoid + Offsets::Humanoid::Health);
        c.maxHealth = memory->read<float>(limbs.humanoid + Offsets::Humanoid::MaxHealth);
        c.position = ReadPartPos(limbs.hrp);
        {
            const float dx = c.position.X - localPlayerPos.X, dy = c.position.Y - localPlayerPos.Y, dz = c.position.Z - localPlayerPos.Z;
            c.distance = sqrtf(dx * dx + dy * dy + dz * dz);
        }
        c.tool = "None";
        for (auto& child : RBX::RbxInstance(character.Addr).GetChildList()) {
            if (child.GetClass() == "Tool") {
                c.tool = child.GetName();
                break;
            }
        }
        c.isValid = EspReadyFlags(c);
        if (!slot)
            players.push_back(std::move(c));
    }

    // Drop only players who left Players — never drop for dead/team/no-HRP.
    players.erase(std::remove_if(players.begin(), players.end(), [&](const CachedPlayer& c) {
        return seenPlayers.find(c.playerAddr) == seenPlayers.end();
    }), players.end());
    PruneLimbs(aliveChars);
}
}
