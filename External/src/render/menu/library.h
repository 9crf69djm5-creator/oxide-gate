#pragma once

#ifndef IMGUI_DEFINE_MATH_OPERATORS
#define IMGUI_DEFINE_MATH_OPERATORS
#endif
#include "../../../ext/imgui/imgui.h"
#include "../../../ext/imgui/imgui_internal.h"
#include "anim.h"

#include <string>
#include <unordered_map>

namespace imGuiCustom
{
struct Theme
{
    ImVec4 WindowBg;
    ImVec4 CardBg;
    ImVec4 ControlBg;
    ImVec4 ControlInactive;
    ImVec4 Border;
    ImVec4 Accent;
    ImVec4 AccentText;
    ImVec4 Text;
    ImVec4 TextBright;
    ImVec4 KeybindBg;
};

struct Fonts
{
    ImFont* CascadiaMonoBL = nullptr;
};

inline Theme& GetThemeMutable()
{
    // OXIDE — ink panels + copper accent (distinct from purple/jatos)
    static Theme g_Theme = {
        ImVec4(0.045f, 0.048f, 0.052f, 1.0f),   // WindowBg
        ImVec4(0.090f, 0.094f, 0.098f, 1.0f),   // CardBg
        ImVec4(0.125f, 0.128f, 0.132f, 1.0f),   // ControlBg
        ImVec4(0.165f, 0.168f, 0.172f, 1.0f),   // ControlInactive
        ImVec4(0.220f, 0.200f, 0.160f, 1.0f),   // Border (warm)
        ImVec4(0.900f, 0.520f, 0.180f, 1.0f),   // Accent copper
        ImVec4(0.980f, 0.720f, 0.320f, 1.0f),   // AccentText
        ImVec4(0.700f, 0.680f, 0.640f, 1.0f),   // Text
        ImVec4(0.960f, 0.940f, 0.880f, 1.0f),   // TextBright
        ImVec4(0.110f, 0.112f, 0.115f, 1.0f),   // KeybindBg
    };
    return g_Theme;
}

inline const Theme& GetTheme() { return GetThemeMutable(); }

inline Fonts& GetFontsMutable()
{
    static Fonts g_Fonts = {};
    return g_Fonts;
}

inline const Fonts& GetFonts() { return GetFontsMutable(); }

inline void ApplyStyle()
{
    ImGuiStyle& style = ImGui::GetStyle();
    const Theme& g_Theme = GetTheme();
    style.WindowRounding = 4.0f;
    style.ChildRounding = 3.0f;
    style.FrameRounding = 3.0f;
    style.PopupRounding = 4.0f;
    style.ScrollbarRounding = 3.0f;
    style.GrabRounding = 3.0f;
    style.TabRounding = 3.0f;
    style.WindowBorderSize = 0.0f;
    style.FrameBorderSize = 0.0f;
    style.WindowPadding = ImVec2(0.0f, 0.0f);
    style.FramePadding = ImVec2(4.0f, 3.0f);
    style.ItemSpacing = ImVec2(6.0f, 4.0f);
    style.ItemInnerSpacing = ImVec2(4.0f, 2.0f);
    style.ScrollbarSize = 8.0f;
    style.AntiAliasedLines = true;
    style.AntiAliasedLinesUseTex = true;
    style.AntiAliasedFill = true;
    style.Colors[ImGuiCol_WindowBg] = g_Theme.WindowBg;
    style.Colors[ImGuiCol_ChildBg] = g_Theme.CardBg;
    style.Colors[ImGuiCol_PopupBg] = g_Theme.CardBg;
    style.Colors[ImGuiCol_Text] = g_Theme.Text;
    style.Colors[ImGuiCol_Border] = g_Theme.Border;
    style.Colors[ImGuiCol_ScrollbarBg] = ImVec4(0.0f, 0.0f, 0.0f, 0.0f);
    style.Colors[ImGuiCol_ScrollbarGrab] = g_Theme.ControlInactive;
    style.Colors[ImGuiCol_ScrollbarGrabHovered] = g_Theme.Accent;
    style.Colors[ImGuiCol_ScrollbarGrabActive] = g_Theme.Accent;
    style.Colors[ImGuiCol_Button] = g_Theme.ControlBg;
    style.Colors[ImGuiCol_ButtonHovered] = g_Theme.ControlInactive;
    style.Colors[ImGuiCol_ButtonActive] = g_Theme.Accent;
    style.Colors[ImGuiCol_FrameBg] = g_Theme.ControlBg;
    style.Colors[ImGuiCol_FrameBgHovered] = g_Theme.ControlInactive;
    style.Colors[ImGuiCol_FrameBgActive] = g_Theme.ControlInactive;
    style.Colors[ImGuiCol_CheckMark] = g_Theme.Accent;
    style.Colors[ImGuiCol_SliderGrab] = g_Theme.Accent;
    style.Colors[ImGuiCol_SliderGrabActive] = g_Theme.AccentText;
}

inline void Initialize(ImFont* cascadiaMonoBL)
{
    GetFontsMutable().CascadiaMonoBL = cascadiaMonoBL;
    ApplyStyle();
}

inline float AnimateFloat(ImGuiID id, bool enabled, float speed = 12.0f)
{
    return Anim::Bool(id, enabled, speed);
}

inline ImVec4 LerpColor(const ImVec4& a, const ImVec4& b, float t)
{
    return ImVec4(ImLerp(a.x, b.x, t), ImLerp(a.y, b.y, t), ImLerp(a.z, b.z, t), ImLerp(a.w, b.w, t));
}

inline ImU32 OutlineBlack() { return ImGui::GetColorU32(IM_COL32(0, 0, 0, 180)); }
inline ImU32 OutlineInner() { return ImGui::GetColorU32(IM_COL32(48, 48, 56, 200)); }

// Sidebar + dual-card content layout (OXIDE — tighter, less rounded)
inline float g_sidebarW = 158.0f;
inline float g_menuRound = 4.0f;
inline float g_cardRound = 3.0f;
inline float g_colW = 286.0f;
inline float g_colGap = 12.0f;
inline float g_contentTop = 14.0f;
inline float g_contentPad = 12.0f;

inline float Col0() { return g_sidebarW + g_contentPad; }
inline float Col1() { return Col0() + g_colW + g_colGap; }
inline float CtrlW() { return g_colW - 24.0f; }
inline float KeyX(float col) { return col + CtrlW() - 68.0f; }
inline float ColorX(float col) { return col + CtrlW() - 12.0f; }
inline float ContentBottomPad() { return 12.0f; }

inline ImVec2 g_contentOffset = ImVec2(0.0f, 0.0f);
inline float g_fontScale = 1.0f;
inline float SliderTop() { return 12.0f * g_fontScale + 5.0f; }
inline float SliderStep() { return 12.0f * g_fontScale + 5.0f + 15.0f; }
inline float ComboTop() { return 12.0f * g_fontScale + 3.0f; }
inline float ComboStep() { return 22.0f; }
inline float CheckStep() { return 15.0f * g_fontScale + 6.0f; }
inline float CardContentY(float cardY) { return cardY + 32.0f; }

inline ImGuiID& ComboOpenId() { static ImGuiID v = 0; return v; }
inline int& ComboClosedFrame() { static int f = -100000; return f; }
inline bool PopupBlocking() {
    if (ImGui::GetFrameCount() == ComboClosedFrame())
        return true;
    return ComboOpenId() != 0;
}

inline ImU32 ColorU32(const ImVec4& color, float alpha_mul = 1.0f)
{
    ImVec4 c = color;
    c.w *= alpha_mul;
    return ImGui::GetColorU32(c);
}

inline void DrawCard(const char* id, const ImVec2& pos, const ImVec2& size, const char* title = nullptr)
{
    ImGui::PushID(id);
    ImDrawList* draw = ImGui::GetWindowDrawList();
    const ImVec2 winPos = ImGui::GetWindowPos();
    const ImVec2 min = ImVec2(std::floor(winPos.x + pos.x + g_contentOffset.x), std::floor(winPos.y + pos.y + g_contentOffset.y));
    const ImVec2 max = ImVec2(min.x + std::floor(size.x), min.y + std::floor(size.y));
    const Theme& theme = GetTheme();
    const bool hovered = ImGui::IsWindowHovered(ImGuiHoveredFlags_ChildWindows) && ImGui::IsMouseHoveringRect(min, max, false) && !PopupBlocking();
    const float hover = Anim::Bool(ImGui::GetID("card_hover"), hovered, 9.0f);
    const float lift = hover * Anim::Motion();
    if (lift > 0.01f)
        draw->AddRectFilled(ImVec2(min.x + 1.0f, min.y + 2.0f + 2.0f * lift), ImVec2(max.x - 1.0f, max.y + 2.0f + 3.0f * lift),
                            IM_COL32(0, 0, 0, static_cast<int>(80.0f * lift)), g_cardRound + 2.0f);
    Anim::Glow(draw, min, max, theme.Accent, 0.20f * hover, g_cardRound, 6.0f, 4);
    draw->AddRectFilled(min, max, ColorU32(theme.CardBg), g_cardRound);
    draw->AddRect(min, max, ColorU32(LerpColor(ImVec4(theme.Border.x, theme.Border.y, theme.Border.z, theme.Border.w * 0.45f),
                                               ImVec4(theme.Accent.x, theme.Accent.y, theme.Accent.z, theme.Accent.w * 0.50f), hover)),
                  g_cardRound, 0, 1.0f);
    // left copper tick — stretches when the card is hovered
    const float tickH = 20.0f + 10.0f * Anim::OutCubic(hover);
    draw->AddRectFilled(ImVec2(min.x, min.y + 8.0f), ImVec2(min.x + 2.0f, min.y + 8.0f + tickH), ColorU32(theme.Accent, 0.95f), 1.0f);
    if (title && title[0]) {
        const Fonts& fonts = GetFonts();
        ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
        const float fs = 12.0f * g_fontScale;
        draw->AddText(font, fs, ImVec2(min.x + 12.0f + 2.0f * lift, min.y + 10.0f), ColorU32(theme.TextBright), title);
        const float lineY = min.y + 10.0f + fs + 5.0f;
        const float lx0 = min.x + 12.0f;
        const float lineW = (max.x - 12.0f) - lx0;
        draw->AddLine(ImVec2(lx0, lineY), ImVec2(max.x - 12.0f, lineY), ColorU32(theme.Border, 0.55f), 1.0f);
        // accent run on the underline: sweeps in with the page, extends on hover
        const float run = lineW * (0.16f + 0.84f * Anim::OutCubic(hover)) * Anim::OutCubic(g_pageT);
        if (run > 1.0f)
            draw->AddRectFilledMultiColor(ImVec2(lx0, lineY - 0.5f), ImVec2(lx0 + run, lineY + 1.0f),
                                          ColorU32(theme.Accent, 0.95f), ColorU32(theme.Accent, 0.15f),
                                          ColorU32(theme.Accent, 0.15f), ColorU32(theme.Accent, 0.95f));
    }
    ImGui::PopID();
}

inline void AddTextWithOutline(ImDrawList* draw_list, ImFont* font, float font_size, const ImVec2& pos, ImU32 text_col, const char* text)
{
    const ImU32 outline_col = OutlineBlack();
    static const ImVec2 offsets[8] = {
        ImVec2(-1.0f, -1.0f), ImVec2(0.0f, -1.0f), ImVec2(1.0f, -1.0f),
        ImVec2(-1.0f,  0.0f),                      ImVec2(1.0f,  0.0f),
        ImVec2(-1.0f,  1.0f), ImVec2(0.0f,  1.0f), ImVec2(1.0f,  1.0f)
    };
    if (font)
    {
        for (int i = 0; i < 8; ++i)
            draw_list->AddText(font, font_size, ImVec2(pos.x + offsets[i].x, pos.y + offsets[i].y), outline_col, text);
        draw_list->AddText(font, font_size, pos, text_col, text);
    }
    else
    {
        for (int i = 0; i < 8; ++i)
            draw_list->AddText(ImVec2(pos.x + offsets[i].x, pos.y + offsets[i].y), outline_col, text);
        draw_list->AddText(pos, text_col, text);
    }
}

inline bool Checkbox(const char* label, bool* value, const ImVec2& pos)
{
    const char* display = label;
    const char* hash = strstr(label, "##");
    std::string displayStr;
    if (hash) displayStr.assign(label, hash - label), display = displayStr.c_str();
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    const ImVec2 base = window->Pos;
    const ImVec2 min = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    const float switch_w = 30.0f;
    const float switch_h = 16.0f;
    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
    const float font_size = 12.5f * g_fontScale;
    const ImVec2 text_size = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, display);
    const float row_w = text_size.x + 10.0f + switch_w;
    ImGui::SetCursorScreenPos(min);
    ImGui::PushID(label);
    const bool pressed = ImGui::InvisibleButton("##checkbox", ImVec2(row_w + 4.0f, switch_h + 2.0f));
    const ImGuiID id = ImGui::GetItemID();
    if (pressed && !PopupBlocking()) {
        *value = !*value;
        Anim::Trigger(id + 3);
    }

    const bool hovered = ImGui::IsItemHovered() && !PopupBlocking();
    const float check = AnimateFloat(id, *value, 14.0f);
    const float hover = AnimateFloat(id + 1, hovered, 14.0f);
    const float motion = Anim::Motion();
    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();

    // hover band: accent wash fading to the right + a spine that grows from the center
    if (hover > 0.01f) {
        const ImVec2 bmin(min.x - 7.0f, min.y - 2.0f);
        const ImVec2 bmax(min.x + row_w + 7.0f, min.y + switch_h + 2.0f);
        const ImU32 strong = ColorU32(theme.Accent, 0.11f * hover);
        const ImU32 clear = ColorU32(theme.Accent, 0.0f);
        draw->AddRectFilledMultiColor(bmin, bmax, strong, clear, clear, strong);
        const float spine = (bmax.y - bmin.y) * Anim::OutCubic(hover);
        const float cy = (bmin.y + bmax.y) * 0.5f;
        draw->AddRectFilled(ImVec2(bmin.x, cy - spine * 0.5f), ImVec2(bmin.x + 2.0f, cy + spine * 0.5f), ColorU32(theme.Accent, hover), 1.0f);
    }

    draw->AddText(font, font_size, ImVec2(min.x + 3.0f * hover * motion, min.y + (switch_h - text_size.y) * 0.5f),
                  ColorU32(LerpColor(theme.Text, theme.TextBright, hover * 0.6f + check * 0.15f)), display);

    const ImVec2 sw_min(min.x + text_size.x + 10.0f, min.y);
    const ImVec2 sw_max = sw_min + ImVec2(switch_w, switch_h);
    const float round = switch_h * 0.5f;
    const float knob_r = 6.0f + 0.7f * hover * motion;
    const float knob_x = ImLerp(sw_min.x + 2.0f + 6.0f, sw_max.x - 2.0f - 6.0f, check);
    const float knob_y = sw_min.y + switch_h * 0.5f;

    Anim::Glow(draw, sw_min, sw_max, theme.Accent, 0.30f * check + 0.30f * hover, round, 5.0f, 3);
    draw->AddRectFilled(sw_min, sw_max, ColorU32(theme.ControlInactive), round);
    // accent fill trails the knob, so the track "fills up" as it slides
    if (check > 0.001f)
        draw->AddRectFilled(sw_min, ImVec2(ImMin(knob_x + 8.0f, sw_max.x), sw_max.y), ColorU32(theme.Accent, ImMin(1.0f, check * 1.5f)), round);
    draw->AddRect(sw_min, sw_max, ColorU32(LerpColor(ImVec4(theme.Border.x, theme.Border.y, theme.Border.z, theme.Border.w * 0.45f), theme.Accent, hover * 0.8f)), round, 0, 1.0f);

    // knob squashes into a pill mid-travel
    const float stretch = std::sin(check * IM_PI) * 5.0f * motion;
    draw->AddRectFilled(ImVec2(knob_x - knob_r - stretch * 0.5f, knob_y - knob_r), ImVec2(knob_x + knob_r + stretch * 0.5f, knob_y + knob_r),
                        ColorU32(theme.TextBright), knob_r);
    if (check > 0.02f)
        draw->AddCircleFilled(ImVec2(knob_x, knob_y), 2.0f * check, ColorU32(theme.Accent, check), 12);

    const float ripple = Anim::Elapsed(id + 3, 0.45f);
    if (ripple >= 0.0f)
        draw->AddCircle(ImVec2(knob_x, knob_y), knob_r + 11.0f * Anim::OutCubic(ripple), ColorU32(theme.Accent, (1.0f - ripple) * 0.7f), 24, 1.5f);

    if (hovered)
        Hint::Offer(id, display, ImRect(ImVec2(min.x - 7.0f, min.y - 2.0f), ImVec2(sw_max.x + 7.0f, sw_max.y + 2.0f)));
    ImGui::PopID();
    return pressed;
}

inline bool ParseHexColor(const char* text, ImVec4& out) {
    if (!text)
        return false;
    while (*text == ' ' || *text == '\t')
        ++text;
    if (*text == '#')
        ++text;
    size_t len = 0;
    while (text[len] != '\0' && len < 9)
        ++len;
    if ((len != 6 && len != 8) || text[len] != '\0')
        return false;
    auto hexVal = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return c - 'a' + 10;
        if (c >= 'A' && c <= 'F') return c - 'A' + 10;
        return -1;
    };
    unsigned int v[8];
    for (size_t i = 0; i < len; ++i) {
        int h = hexVal(text[i]);
        if (h < 0)
            return false;
        v[i] = (unsigned int)h;
    }
    out.x = (float)(v[0] * 16 + v[1]) / 255.0f;
    out.y = (float)(v[2] * 16 + v[3]) / 255.0f;
    out.z = (float)(v[4] * 16 + v[5]) / 255.0f;
    out.w = (len == 8) ? (float)(v[6] * 16 + v[7]) / 255.0f : out.w;
    return true;
}

inline bool SliderFloat(const char* label, float* value, float min_value, float max_value, const ImVec2& pos, float width, const char* text_label, const char* format);

inline bool ColorSquare(const char* id_text, ImVec4* color, const ImVec2& pos)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();

    const ImVec2 base = window->Pos;
    const ImVec2 min = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    const ImVec2 size(12.0f, 9.0f);

    ImGui::SetCursorScreenPos(min);

    const bool pressed = ImGui::InvisibleButton(id_text, size);
    static bool colorDragging = false;
    static ImVec2 colorGrabOff{};

    ImDrawList* draw = ImGui::GetWindowDrawList();

    draw->AddRectFilled(min, min + size, ColorU32(*color), 0.0f);
    draw->AddRect(min, min + size, OutlineBlack(), 0.0f, 0, 1.0f);
    if (pressed)
        ImGui::OpenPopup(id_text);

    if (ImGui::BeginPopup(id_text))
    {
        ImVec2 popPos = ImGui::GetWindowPos();
        ImVec2 popSize = ImGui::GetWindowSize();
        ImGui::SetCursorScreenPos(popPos);
        ImGui::PushID("color_drag");
        ImGui::InvisibleButton("##color_drag", ImVec2(popSize.x, 10.0f));
        ImGuiID dragId = ImGui::GetItemID();
        float dragHov = AnimateFloat(dragId, ImGui::IsItemHovered(), 18.0f);
        ImDrawList* dragDraw = ImGui::GetWindowDrawList();
        for (int i = 0; i < 3; ++i) {
            float dx = popPos.x + popSize.x * 0.5f + (float)(i - 1) * 8.0f;
            dragDraw->AddCircleFilled(ImVec2(dx, popPos.y + 5.0f), 1.2f, ColorU32(LerpColor(GetTheme().Text, GetTheme().TextBright, dragHov)), 8);
        }
        if (ImGui::IsItemActivated()) {
            colorGrabOff = ImGui::GetIO().MousePos - popPos;
            colorDragging = true;
        }
        if (colorDragging) {
            if (ImGui::IsMouseDown(ImGuiMouseButton_Left))
                ImGui::SetWindowPos(ImGui::GetIO().MousePos - colorGrabOff, ImGuiCond_Always);
            else
                colorDragging = false;
        }
        ImGui::PopID();
        ImGui::PushStyleColor(ImGuiCol_FrameBg, GetTheme().CardBg);
        ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, GetTheme().ControlInactive);
        ImGui::PushStyleColor(ImGuiCol_FrameBgActive, GetTheme().ControlInactive);
        ImGui::PushStyleColor(ImGuiCol_SliderGrab, GetTheme().Accent);
        ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, GetTheme().Accent);
        ImGui::PushStyleColor(ImGuiCol_Button, GetTheme().ControlBg);
        ImGui::PushStyleColor(ImGuiCol_ButtonHovered, GetTheme().ControlInactive);
        ImGui::PushStyleColor(ImGuiCol_ButtonActive, GetTheme().ControlInactive);
        ImGui::PushStyleColor(ImGuiCol_Header, GetTheme().CardBg);
        ImGui::PushStyleColor(ImGuiCol_HeaderHovered, GetTheme().ControlInactive);
        ImGui::PushStyleColor(ImGuiCol_HeaderActive, GetTheme().ControlInactive);
        ImGui::ColorPicker4("##picker", (float*)color, ImGuiColorEditFlags_NoSidePreview | ImGuiColorEditFlags_NoSmallPreview | ImGuiColorEditFlags_NoInputs | ImGuiColorEditFlags_NoOptions | ImGuiColorEditFlags_PickerHueBar);
        ImGui::PopStyleColor(11);
        const Theme& ptheme = GetTheme();
        ImFont* pfont = GetFonts().CascadiaMonoBL ? GetFonts().CascadiaMonoBL : ImGui::GetFont();
        ImGuiWindow* pwin = ImGui::GetCurrentWindow();
        ImVec2 prel = ImGui::GetCursorScreenPos() - pwin->Pos + ImVec2(0.0f, 16.0f);
        SliderFloat("hex_opacity", &color->w, 0.0f, 1.0f, prel, 180.0f, "Opacity", "%.2f");
        if (color->w < 0.0f) color->w = 0.0f;
        if (color->w > 1.0f) color->w = 1.0f;
        char hex[16];
        ImFormatString(hex, IM_ARRAYSIZE(hex), "#%02X%02X%02X%02X",
            (int)(ImClamp(color->x, 0.0f, 1.0f) * 255.0f),
            (int)(ImClamp(color->y, 0.0f, 1.0f) * 255.0f),
            (int)(ImClamp(color->z, 0.0f, 1.0f) * 255.0f),
            (int)(ImClamp(color->w, 0.0f, 1.0f) * 255.0f));
        ImVec2 hexRel = prel + ImVec2(0.0f, 15.0f);
        ImVec2 hexMin = pwin->Pos + hexRel;
        ImVec2 hexTs = pfont->CalcTextSizeA(12.0f * g_fontScale, FLT_MAX, 0.0f, hex);
        ImGui::SetCursorScreenPos(hexMin);
        ImGui::PushID("hex_ctx_btn");
        ImGui::InvisibleButton("##hex", ImVec2(hexTs.x + 6.0f, 15.0f));
        ImGuiID hexId = ImGui::GetItemID();
        float hexHov = AnimateFloat(hexId, ImGui::IsItemHovered(), 18.0f);
        ImGui::GetWindowDrawList()->AddText(pfont, 12.0f * g_fontScale, hexMin, ColorU32(LerpColor(ptheme.Text, ptheme.TextBright, hexHov)), hex);
        static ImGuiID hexCtxOpen = 0;
        if (ImGui::IsItemClicked(ImGuiMouseButton_Right))
            hexCtxOpen = (hexCtxOpen == hexId) ? 0 : hexId;
        bool hexCtx = (hexCtxOpen == hexId);
        float hexCtxAnim = AnimateFloat(hexId + 40, hexCtx, 18.0f);
        const float hexRowH = 16.0f;
        const float hexPad = 3.0f;
        const float hexPopW = 110.0f;
        const float hexFullH = hexPad * 2.0f + hexRowH * 2.0f;
        ImVec2 hexPopMin(hexMin.x, hexMin.y + 16.0f);
        if (hexCtx && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !ImRect(hexPopMin, ImVec2(hexPopMin.x + hexPopW, hexPopMin.y + hexFullH)).Contains(ImGui::GetIO().MousePos))
            hexCtxOpen = 0;
        if (hexCtxAnim > 0.01f) {
            ImDrawList* hexFg = ImGui::GetForegroundDrawList();
            hexFg->PushClipRect(hexPopMin, ImVec2(hexPopMin.x + hexPopW, hexPopMin.y + hexFullH * hexCtxAnim), true);
            ImVec2 hexBoxMax = ImVec2(hexPopMin.x + hexPopW, hexPopMin.y + hexFullH);
            hexFg->AddRectFilled(hexPopMin, hexBoxMax, ColorU32(ptheme.ControlBg, hexCtxAnim), 0.0f);
            hexFg->AddRect(hexPopMin, hexBoxMax, ImGui::GetColorU32(IM_COL32(0, 0, 0, (int)(255 * hexCtxAnim))), 0.0f, 0, 1.0f);
            const char* hexOpts[2] = {"Copy Hex", "Paste Hex"};
            for (int i = 0; i < 2; ++i) {
                ImVec2 iMin(hexPopMin.x + 2.0f, hexPopMin.y + hexPad + hexRowH * i);
                ImVec2 iMax(hexPopMin.x + hexPopW - 2.0f, iMin.y + hexRowH);
                bool hov = ImRect(iMin, iMax).Contains(ImGui::GetIO().MousePos);
                ImGui::PushID(100 + i);
                ImGuiID iid = ImGui::GetID("hex_opt");
                float ih = AnimateFloat(iid, hov, 18.0f);
                ImVec4 parsed{};
                bool valid = (i == 1) ? ParseHexColor(ImGui::GetClipboardText(), parsed) : true;
                if (ih > 0.01f)
                    hexFg->AddRectFilled(iMin, iMax, ColorU32(LerpColor(ptheme.ControlBg, ptheme.ControlInactive, ih * 0.8f), hexCtxAnim), 0.0f);
                hexFg->AddText(pfont, 12.0f * g_fontScale, ImVec2(iMin.x + 4.0f, iMin.y + 2.0f), ColorU32(valid ? LerpColor(ptheme.Text, ptheme.TextBright, ih * 0.35f) : ImVec4(0.45f, 0.45f, 0.45f, 1.0f), hexCtxAnim), hexOpts[i]);
                if (hexCtx && hexCtxAnim > 0.70f && hov && valid && ImGui::IsMouseClicked(ImGuiMouseButton_Left)) {
                    if (i == 0)
                        ImGui::SetClipboardText(hex);
                    else
                        *color = parsed;
                    hexCtxOpen = 0;
                }
                ImGui::PopID();
            }
            hexFg->PopClipRect();
        }
        ImGui::PopID();
        popPos = ImGui::GetWindowPos();
        popSize = ImGui::GetWindowSize();
        ImGui::EndPopup();
        ImDrawList* popFg = ImGui::GetForegroundDrawList();
        popFg->AddRect(popPos, popPos + popSize, OutlineBlack(), 0.0f, 0, 1.0f);
        popFg->AddRect(popPos + ImVec2(1.0f, 1.0f), popPos + popSize - ImVec2(1.0f, 1.0f), OutlineInner(), 0.0f, 0, 1.0f);
    } else {
        colorDragging = false;
    }

    return pressed;
}

inline const char* KeyName(int key)
{
    switch (key)
    {
    case 0x01: return "Left Mouse";
    case 0x02: return "Right Mouse";
    case 0x04: return "Middle Mouse";
    case 0x10: return "Shift";
    case 0x11: return "Ctrl";
    case 0x12: return "Alt";
    case 0x20: return "Space";
    default: break;
    }
    if (key >= ImGuiKey_NamedKey_BEGIN && key < ImGuiKey_NamedKey_END)
        return ImGui::GetKeyName((ImGuiKey)key);

    static char name[16];

    if (key >= 'A' && key <= 'Z')
        ImFormatString(name, IM_ARRAYSIZE(name), "%c", key);
    else if (key >= 'a' && key <= 'z')
        ImFormatString(name, IM_ARRAYSIZE(name), "%c", key - 32); // convert to uppercase
    else
        ImFormatString(name, IM_ARRAYSIZE(name), "Key %d", key);

    return name;
}

inline bool Keybind(const char* label, int* key, const ImVec2& pos, const ImVec2& size = ImVec2(68.0f, 13.0f), int* mode = nullptr)
{
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    const ImVec2 base = window->Pos;
    const ImVec2 min = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    ImGui::SetCursorScreenPos(min);
    const bool pressed = ImGui::InvisibleButton(label, size);
    const ImGuiID id = ImGui::GetItemID();
    const bool right_clicked = ImGui::IsItemClicked(ImGuiMouseButton_Right);

    static std::unordered_map<ImGuiID, int> s_keybind_modes;
    int& current_mode = mode ? *mode : s_keybind_modes[id];

    static ImGuiID context_open_id = 0;
    if (right_clicked)
    {
        context_open_id = (context_open_id == id) ? 0 : id;
    }

    static ImGuiID waiting_id = 0;
    static bool wait_mouse_release = false;
    if (pressed && !PopupBlocking())
    {
        context_open_id = 0;
        waiting_id = id;
        wait_mouse_release = true;
        ImGui::SetActiveID(id, window);
    }

    const bool active = waiting_id == id;
    if (active)
    {
        ImGuiIO& io = ImGui::GetIO();
        bool any_mouse_down = false;
        for (int i = 0; i < IM_ARRAYSIZE(io.MouseDown); ++i)
            any_mouse_down |= io.MouseDown[i];
        if (!any_mouse_down)
            wait_mouse_release = false;

        if (ImGui::IsKeyPressed(ImGuiKey_Escape))
        {
            *key = 0;
            waiting_id = 0;
            ImGui::ClearActiveID();
        }

        for (int key_code = ImGuiKey_NamedKey_BEGIN; key_code < ImGuiKey_NamedKey_END; ++key_code)
        {
            ImGuiKey imgui_key = (ImGuiKey)key_code;
            if (ImGui::IsKeyPressed(imgui_key) && imgui_key != ImGuiKey_Escape)
            {
                *key = key_code;
                waiting_id = 0;
                ImGui::ClearActiveID();
                break;
            }
        }

        if (waiting_id == id && !wait_mouse_release)
        {
            for (int i = 0; i < IM_ARRAYSIZE(io.MouseDown); ++i)
            {
                if (ImGui::IsMouseClicked(i))
                {
                    *key = i == 0 ? 0x01 : i == 1 ? 0x02 : 0x04;
                    waiting_id = 0;
                    ImGui::ClearActiveID();
                    break;
                }
            }
        }
    }

    const float active_anim = AnimateFloat(id, active || ImGui::IsItemHovered(), 16.0f);
    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();
    const float breathe = active ? (0.5f + 0.5f * std::sin(static_cast<float>(ImGui::GetTime()) * 6.0f)) : 0.0f;
    Anim::Glow(draw, min, min + size, theme.Accent, 0.25f * active_anim + 0.35f * breathe, 4.0f, 5.0f, 3);
    draw->AddRectFilled(min, min + size, ColorU32(LerpColor(theme.KeybindBg, theme.ControlInactive, active_anim * 0.35f)), 4.0f);
    draw->AddRect(min, min + size, ColorU32(LerpColor(ImVec4(theme.Border.x, theme.Border.y, theme.Border.z, theme.Border.w * 0.5f), theme.Accent, active_anim * 0.85f)), 4.0f, 0, 1.0f);

    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
    const float font_size = 12.0f * g_fontScale;
    const char* text = active ? "..." : (current_mode == 2 && *key == 0 ? "Always" : KeyName(*key));
    const ImVec2 text_size = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, text);
    draw->AddText(font, font_size, ImVec2(min.x + (size.x - text_size.x) * 0.5f, min.y + (size.y - text_size.y) * 0.5f), ColorU32(ImVec4(0.839f, 0.839f, 0.839f, 1.0f)), text);

    const bool context_open = (context_open_id == id);
    const float context_anim = AnimateFloat(id + 20, context_open, 18.0f);
    const float popup_w = size.x;
    const float row_height = 16.0f;
    const float popup_padding = 3.0f;
    const float full_height = popup_padding * 2.0f + row_height * 3.0f;
    const float visible_height = full_height * context_anim;

    const ImVec2 popup_min(min.x, min.y + size.y + 2.0f);
    const ImVec2 popup_max(popup_min.x + popup_w, popup_min.y + visible_height);
    const ImRect total_rect(min, ImVec2(min.x + popup_w, popup_min.y + full_height));

    if (context_open && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !total_rect.Contains(ImGui::GetIO().MousePos))
    {
        context_open_id = 0;
    }

    if (context_anim > 0.01f)
    {
        ImDrawList* overlay = ImGui::GetForegroundDrawList();
        overlay->PushClipRect(popup_min, popup_max, true);
        const ImVec2 popup_box_max = ImVec2(popup_min.x + popup_w, popup_min.y + full_height);
        overlay->AddRectFilled(popup_min, popup_box_max, ColorU32(theme.ControlBg, context_anim), 0.0f);

        overlay->AddRect(popup_min, popup_box_max, ImGui::GetColorU32(IM_COL32(0, 0, 0, (int)(255 * context_anim))), 0.0f, 0, 1.0f);
        overlay->AddRect(popup_min + ImVec2(1.0f, 1.0f), popup_box_max - ImVec2(1.0f, 1.0f), ImGui::GetColorU32(IM_COL32(52, 52, 56, (int)(255 * context_anim))), 0.0f, 0, 1.0f);

        struct ModeDef { const char* label; int value; };
        static const ModeDef mode_list[3] = {
            { "Toggle", 1 },
            { "Hold",   0 },
            { "Always", 2 }
        };

        for (int i = 0; i < 3; ++i)
        {
            const ImVec2 item_min(popup_min.x + 2.0f, popup_min.y + popup_padding + row_height * i);
            const ImVec2 item_max(popup_min.x + popup_w - 2.0f, item_min.y + row_height);
            const ImRect item_rect(item_min, item_max);
            const bool item_hovered = item_rect.Contains(ImGui::GetIO().MousePos);
            const bool item_pressed = context_open && context_anim > 0.70f && item_hovered && ImGui::IsMouseClicked(ImGuiMouseButton_Left);

            ImGui::PushID(i);
            const ImGuiID item_id = ImGui::GetID("kb_mode");
            const float item_hover = AnimateFloat(item_id, item_hovered, 18.0f);
            const bool is_current = (current_mode == mode_list[i].value);
            const float item_selected = AnimateFloat(item_id + 1, is_current, 18.0f);
            const float item_appear = ImClamp((context_anim - i * 0.08f) / 0.45f, 0.0f, 1.0f);

            const ImVec4 row_color = LerpColor(theme.ControlBg, theme.ControlInactive, item_hover * 0.8f + item_selected * 0.4f);
            if (item_hover > 0.01f || item_selected > 0.01f)
                overlay->AddRectFilled(item_min, item_max, ColorU32(row_color, context_anim), 0.0f);

            const ImVec4 base_text_color = is_current ? theme.Accent : theme.Text;
            const ImVec4 text_color = LerpColor(base_text_color, theme.TextBright, item_hover * 0.35f);
            const ImVec2 text_sz = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, mode_list[i].label);
            const ImVec2 text_pos(item_min.x + 4.0f, item_min.y + (row_height - text_sz.y) * 0.5f);
            overlay->AddText(font, font_size, text_pos, ColorU32(text_color, item_appear), mode_list[i].label);

            if (item_pressed)
            {
                current_mode = mode_list[i].value;
                if (mode) *mode = mode_list[i].value;
                context_open_id = 0;
                ComboClosedFrame() = ImGui::GetFrameCount();
            }
            ImGui::PopID();
        }

        overlay->PopClipRect();
    }
    if (context_open_id == id)
        ComboOpenId() = id;
    else if (ComboOpenId() == id)
        ComboOpenId() = 0;
    return pressed;
}

inline bool SliderFloat(const char* label, float* value, float min_value, float max_value, const ImVec2& pos, float width, const char* text_label, const char* format = "%.0f")
{
    // OXIDE slider — no +/- buttons (unlike jatos cyan track + -/+ chrome)
    const float font_size = 11.5f * g_fontScale;
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    const ImVec2 base = window->Pos;
    const ImVec2 origin = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    const float track_h = 3.0f;
    const float label_gap = font_size + 6.0f;
    const ImVec2 track_min(origin.x, origin.y);
    const ImVec2 track_max(origin.x + width, origin.y + track_h);

    ImGui::PushID(label);
    ImGui::SetCursorScreenPos(ImVec2(origin.x, origin.y - 2.0f));
    const bool pressed = ImGui::InvisibleButton("##slider_total", ImVec2(width, track_h + 10.0f));
    const ImGuiID id = ImGui::GetItemID();
    const bool active = ImGui::IsItemActive();
    const bool hovered = ImGui::IsItemHovered();
    bool changed = false;

    if (active && !PopupBlocking())
    {
        const ImVec2 mouse = ImGui::GetIO().MousePos;
        float t = (mouse.x - track_min.x) / width;
        t = ImClamp(t, 0.0f, 1.0f);
        const float new_value = min_value + (max_value - min_value) * t;
        if (*value != new_value)
        {
            *value = new_value;
            changed = true;
        }
    }

    const float target_t = ImClamp((*value - min_value) / (max_value - min_value), 0.0f, 1.0f);
    static std::unordered_map<ImGuiID, float> slider_values;
    float& animated_t = slider_values[id];
    animated_t = Anim::Approach(animated_t, target_t, 16.0f);
    const float hover = AnimateFloat(id + 1, hovered || active, 16.0f);
    const float drag = AnimateFloat(id + 2, active, 18.0f);
    const float motion = Anim::Motion();

    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();
    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();

    char value_text[64];
    ImFormatString(value_text, IM_ARRAYSIZE(value_text), format, *value);
    const ImVec2 val_ts = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, value_text);
    const float badge_pad_x = 5.0f;
    const float badge_pad_y = 1.5f;
    // value badge lifts and warms up while dragging
    const float badge_lift = std::floor(2.0f * drag * motion);
    const ImVec2 badge_max(origin.x + width, origin.y - 4.0f - badge_lift);
    const ImVec2 badge_min(badge_max.x - val_ts.x - badge_pad_x * 2.0f, badge_max.y - val_ts.y - badge_pad_y * 2.0f);
    Anim::Glow(draw, badge_min, badge_max, theme.Accent, 0.35f * drag, 2.0f, 4.0f, 3);
    draw->AddRectFilled(badge_min, badge_max, ColorU32(LerpColor(theme.ControlBg, theme.Accent, 0.22f * drag)), 2.0f);
    draw->AddRect(badge_min, badge_max, ColorU32(theme.Accent, 0.55f + 0.45f * hover), 2.0f, 0, 1.0f);
    draw->AddText(font, font_size, ImVec2(badge_min.x + badge_pad_x, badge_min.y + badge_pad_y), ColorU32(theme.TextBright), value_text);
    draw->AddText(font, font_size, ImVec2(origin.x, origin.y - 4.0f - val_ts.y - badge_pad_y), ColorU32(LerpColor(theme.Text, theme.TextBright, hover * 0.5f)), text_label);

    // thin copper underline track; fill brightens toward the thumb
    draw->AddRectFilled(track_min, track_max, ColorU32(theme.ControlInactive), 1.0f);
    const float kx = track_min.x + width * animated_t;
    const float ky = track_min.y + track_h * 0.5f;
    if (animated_t > 0.001f) {
        const ImVec2 fill_max(kx, track_max.y);
        Anim::Glow(draw, track_min, fill_max, theme.Accent, 0.30f * hover, 1.0f, 4.0f, 3);
        draw->AddRectFilledMultiColor(track_min, fill_max, ColorU32(theme.Accent, 0.45f), ColorU32(LerpColor(theme.Accent, theme.AccentText, hover * 0.3f)),
                                      ColorU32(LerpColor(theme.Accent, theme.AccentText, hover * 0.3f)), ColorU32(theme.Accent, 0.45f));
    }

    // square thumb that turns into a diamond while dragged
    const float hs = 4.5f + hover * 1.0f * motion;
    Anim::GlowCircle(draw, ImVec2(kx, ky), hs, theme.Accent, 0.55f * hover, 6.0f, 4);
    const float rot = drag * IM_PI * 0.25f;
    ImVec2 quad[4];
    for (int i = 0; i < 4; ++i) {
        const float a = rot + IM_PI * 0.25f + IM_PI * 0.5f * static_cast<float>(i);
        quad[i] = ImVec2(kx + std::cos(a) * hs * 1.41421356f, ky + std::sin(a) * hs * 1.41421356f);
    }
    draw->AddQuadFilled(quad[0], quad[1], quad[2], quad[3], ColorU32(theme.TextBright));
    draw->AddQuad(quad[0], quad[1], quad[2], quad[3], ColorU32(theme.Accent, 0.9f), 1.2f);
    if (hovered || active)
        Hint::Offer(id, text_label, ImRect(ImVec2(origin.x, badge_min.y), ImVec2(origin.x + width, track_max.y + 4.0f)));

    ImGui::PopID();
    (void)label_gap;
    (void)pressed;
    return pressed || changed;
}

inline void DrawComboChrome(ImDrawList* draw, const ImVec2& min, const ImVec2& size, float hover, float open_anim)
{
    const Theme& theme = GetTheme();
    const float a = ImMax(hover, open_anim);
    if (a > 0.01f)
        draw->AddRect(min, min + size, ColorU32(theme.Accent, 0.75f * a), 0.0f, 0, 1.0f);
    // chevron flips as the list opens
    const ImVec2 c(min.x + size.x - 9.0f, min.y + size.y * 0.5f);
    const float ang = open_anim * IM_PI;
    const float cs = std::cos(ang), sn = std::sin(ang);
    auto P = [&](float x, float y) { return ImVec2(c.x + x * cs - y * sn, c.y + x * sn + y * cs); };
    const ImU32 col = ColorU32(LerpColor(theme.Text, theme.Accent, a));
    draw->AddLine(P(-3.0f, -1.5f), P(0.0f, 1.5f), col, 1.3f);
    draw->AddLine(P(0.0f, 1.5f), P(3.0f, -1.5f), col, 1.3f);
}

struct ComboTextAnimation
{
    std::string Previous;
    std::string Current;
    float Blend = 1.0f;
};

inline bool Combo(const char* label, int* current_item, const char* const items[], int items_count, const ImVec2& pos, float width, const char* text_label)
{
    const float font_size = 12.0f * g_fontScale;
    ImGuiWindow* window = ImGui::GetCurrentWindow();
    const ImVec2 base = window->Pos;
    const ImVec2 min = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    const ImVec2 size(width, 18.0f);
    ImGui::PushID(label);
    ImGui::SetCursorScreenPos(min);
    const bool pressed = ImGui::InvisibleButton("##combo_preview", size);

    const bool hovered = ImGui::IsItemHovered();
    const ImGuiID id = ImGui::GetItemID();
    static ImGuiID open_id = 0;
    if (pressed)
        open_id = open_id == id ? 0 : id;

    const bool open = open_id == id;
    const float hover = AnimateFloat(id, hovered, 18.0f);
    const float open_anim = AnimateFloat(id + 10, open, 18.0f);
    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();
    draw->AddRectFilled(min, min + size, ColorU32(LerpColor(theme.ControlBg, theme.ControlInactive, hover * 0.35f)), 0.0f);
    draw->AddRect(min, min + size, OutlineBlack(), 0.0f, 0, 1.0f);
    draw->AddRect(min + ImVec2(1.0f, 1.0f), min + size - ImVec2(1.0f, 1.0f), OutlineInner(), 0.0f, 0, 1.0f);

    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
    if (text_label)
        draw->AddText(font, font_size, ImVec2(min.x, min.y - font_size - 3.0f), ColorU32(theme.Text), text_label);
    DrawComboChrome(draw, min, size, hover, open_anim);
    const char* preview = (*current_item >= 0 && *current_item < items_count) ? items[*current_item] : "";
    static std::unordered_map<ImGuiID, ComboTextAnimation> text_animations;
    ComboTextAnimation& text_anim = text_animations[id];
    if (text_anim.Current.empty())
        text_anim.Current = preview;
    if (text_anim.Current != preview)
    {
        text_anim.Previous = text_anim.Current;
        text_anim.Current = preview;
        text_anim.Blend = 0.0f;
    }
    text_anim.Blend = ImLerp(text_anim.Blend, 1.0f, ImClamp(ImGui::GetIO().DeltaTime * 14.0f, 0.0f, 1.0f));
    ImVec2 preview_sz = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, text_anim.Current.c_str());
    const ImVec2 preview_pos(min.x + 3.0f, min.y + (size.y - preview_sz.y) * 0.5f);
    if (!text_anim.Previous.empty() && text_anim.Blend < 0.98f)
        draw->AddText(font, font_size, preview_pos, ColorU32(theme.Text, 1.0f - text_anim.Blend), text_anim.Previous.c_str());
    draw->AddText(font, font_size, preview_pos, ColorU32(theme.Text, text_anim.Blend), text_anim.Current.c_str());

    bool changed = false;
    const float row_height = 16.0f;
    const float popup_padding = 3.0f;
    const float full_height = popup_padding * 2.0f + row_height * items_count;
    const float visible_height = full_height * open_anim;
    ImVec2 boxMin(min.x, min.y + size.y + 2.0f);
    if (boxMin.y + full_height > ImGui::GetIO().DisplaySize.y && min.y - 2.0f - full_height >= 0.0f)
        boxMin.y = min.y - 2.0f - full_height;
    boxMin.y -= (1.0f - Anim::OutCubic(open_anim)) * 6.0f * Anim::Motion();
    const ImVec2 popup_max(boxMin.x + width, boxMin.y + visible_height);
    const float totalTop = (std::min)(boxMin.y, min.y);
    const float totalBottom = (std::max)(boxMin.y + full_height, min.y + size.y);
    const ImRect total_rect(ImVec2(min.x, totalTop), ImVec2(min.x + width, totalBottom));

    if (open && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !total_rect.Contains(ImGui::GetIO().MousePos)) {
        open_id = 0;
        ComboClosedFrame() = ImGui::GetFrameCount();
    }

    if (open_anim > 0.01f)
    {
        ImDrawList* overlay = ImGui::GetForegroundDrawList();
        overlay->PushClipRect(boxMin, popup_max, true);
        const ImVec2 popup_box_max = ImVec2(boxMin.x + width, boxMin.y + full_height);
        overlay->AddRectFilled(boxMin, popup_box_max, ColorU32(theme.ControlBg, open_anim), 0.0f);
        overlay->AddRect(boxMin, popup_box_max, ImGui::GetColorU32(IM_COL32(0, 0, 0, (int)(255 * open_anim))), 0.0f, 0, 1.0f);
        overlay->AddRect(boxMin + ImVec2(1.0f, 1.0f), popup_box_max - ImVec2(1.0f, 1.0f), ImGui::GetColorU32(IM_COL32(52, 52, 56, (int)(255 * open_anim))), 0.0f, 0, 1.0f);

        for (int i = 0; i < items_count; ++i)
        {
            const ImVec2 item_min(boxMin.x + 2.0f, boxMin.y + popup_padding + row_height * i);
            const ImVec2 item_max(boxMin.x + width - 2.0f, item_min.y + row_height);
            const ImRect item_rect(item_min, item_max);
            const bool item_hovered = item_rect.Contains(ImGui::GetIO().MousePos);
            const bool item_pressed = open && open_anim > 0.70f && item_hovered && ImGui::IsMouseClicked(ImGuiMouseButton_Left);
            ImGui::PushID(i);
            const ImGuiID item_id = ImGui::GetID("combo_item");
            const float item_hover = AnimateFloat(item_id, item_hovered, 18.0f);
            const float item_selected = AnimateFloat(item_id + 1, i == *current_item, 18.0f);
            const float item_appear = ImClamp((open_anim - (float)i / (float)items_count * 0.55f) / 0.45f, 0.0f, 1.0f);
            const ImVec4 row_color = LerpColor(theme.ControlBg, theme.ControlInactive, item_hover * 0.8f + item_selected * 0.4f);
            if (item_hover > 0.01f || item_selected > 0.01f)
                overlay->AddRectFilled(item_min, item_max, ColorU32(row_color, open_anim), 0.0f);
            const ImVec4 text_color = LerpColor(theme.Text, theme.TextBright, item_hover * 0.35f + item_selected * 0.55f);
            if (item_hover > 0.01f)
                overlay->AddRectFilled(item_min, ImVec2(item_min.x + 2.0f, item_max.y), ColorU32(theme.Accent, item_hover * open_anim), 0.0f);
            overlay->AddText(font, font_size, ImVec2(item_min.x + 2.0f + 4.0f * item_hover * Anim::Motion(), item_min.y + 2.0f), ColorU32(text_color, item_appear), items[i]);
            if (item_pressed)
            {
                *current_item = i;
                changed = true;
                open_id = 0;
            }
            ImGui::PopID();
        }
        overlay->PopClipRect();
    }
    if (open_id == id)
        ComboOpenId() = id;
    else if (ComboOpenId() == id) {
        ComboOpenId() = 0;
        ComboClosedFrame() = ImGui::GetFrameCount();
    }
    ImGui::PopID();
    return changed;
}

struct MultiComboTextAnimation
{
    std::string Previous;
    std::string Current;
    float Blend = 1.0f;
};

inline bool MultiCombo(const char* label, bool values[], const char* const items[], int items_count, const ImVec2& pos, float width, const char* text_label)
{
    const float font_size = 12.0f * g_fontScale;
    std::string preview;
    int selected_count = 0;
    for (int i = 0; i < items_count; ++i)
    {
        if (!values[i])
            continue;
        ++selected_count;
        if (!preview.empty())
            preview += " , ";
        preview += items[i];
    }
    if (selected_count > 3)
        preview = std::to_string(selected_count) + " Selected";
    if (preview.empty())
        preview = "Select...";

    ImGuiWindow* window = ImGui::GetCurrentWindow();
    const ImVec2 base = window->Pos;
    const ImVec2 min = ImVec2(std::floor(base.x + pos.x + g_contentOffset.x), std::floor(base.y + pos.y + g_contentOffset.y));
    const ImVec2 size(width, 18.0f);
    const ImVec2 hit_size(width, 20.0f);
    ImGui::PushID(label);
    ImGui::SetCursorScreenPos(min - ImVec2(0.0f, 0.0f));
    const bool pressed = ImGui::InvisibleButton("##multicombo_preview", hit_size);

    const bool hovered = ImGui::IsItemHovered();
    const ImGuiID id = ImGui::GetItemID();
    static ImGuiID open_id = 0;
    if (pressed)
        open_id = open_id == id ? 0 : id;

    const bool open = open_id == id;
    const float hover = AnimateFloat(id, hovered, 16.0f);
    const float open_anim = AnimateFloat(id + 10, open, 18.0f);
    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();
    draw->AddRectFilled(min, min + size, ColorU32(LerpColor(theme.ControlBg, theme.ControlInactive, hover * 0.35f)), 0.0f);
    draw->AddRect(min, min + size, OutlineBlack(), 0.0f, 0, 1.0f);
    draw->AddRect(min + ImVec2(1.0f, 1.0f), min + size - ImVec2(1.0f, 1.0f), OutlineInner(), 0.0f, 0, 1.0f);

    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
    if (text_label)
        draw->AddText(font, font_size, ImVec2(min.x, min.y - font_size - 3.0f), ColorU32(theme.Text), text_label);
    DrawComboChrome(draw, min, size, hover, open_anim);
    static std::unordered_map<ImGuiID, MultiComboTextAnimation> text_animations;
    MultiComboTextAnimation& text_anim = text_animations[id];
    if (text_anim.Current.empty())
        text_anim.Current = preview;
    if (text_anim.Current != preview)
    {
        text_anim.Previous = text_anim.Current;
        text_anim.Current = preview;
        text_anim.Blend = 0.0f;
    }
    text_anim.Blend = ImLerp(text_anim.Blend, 1.0f, ImClamp(ImGui::GetIO().DeltaTime * 14.0f, 0.0f, 1.0f));
    ImVec2 preview_sz = font->CalcTextSizeA(font_size, FLT_MAX, 0.0f, text_anim.Current.c_str());
    const ImVec2 preview_pos(min.x + 3.0f, min.y + (size.y - preview_sz.y) * 0.5f);
    if (!text_anim.Previous.empty() && text_anim.Blend < 0.98f)
        draw->AddText(font, font_size, preview_pos, ColorU32(theme.Text, 1.0f - text_anim.Blend), text_anim.Previous.c_str());
    draw->AddText(font, font_size, preview_pos, ColorU32(theme.Text, text_anim.Blend), text_anim.Current.c_str());

    bool changed = false;
    const float row_height = 17.0f;
    const float popup_padding = 3.0f;
    const float full_height = popup_padding * 2.0f + row_height * items_count;
    const float visible_height = full_height * open_anim;
    const ImVec2 popup_min(min.x, min.y + size.y + 2.0f - (1.0f - Anim::OutCubic(open_anim)) * 6.0f * Anim::Motion());
    const ImVec2 popup_max(popup_min.x + width, popup_min.y + visible_height);
    const ImRect total_rect(min, ImVec2(min.x + width, popup_min.y + full_height));

    if (open && ImGui::IsMouseClicked(ImGuiMouseButton_Left) && !total_rect.Contains(ImGui::GetIO().MousePos))
        open_id = 0;

    if (open_anim > 0.01f)
    {
        ImDrawList* overlay = ImGui::GetForegroundDrawList();
        overlay->PushClipRect(popup_min, popup_max, true);
        const ImVec2 popup_box_max = ImVec2(popup_min.x + width, popup_min.y + full_height);
        overlay->AddRectFilled(popup_min, popup_box_max, ColorU32(theme.ControlBg, open_anim), 0.0f);
        overlay->AddRect(popup_min, popup_box_max, ImGui::GetColorU32(IM_COL32(0, 0, 0, (int)(255 * open_anim))), 0.0f, 0, 1.0f);
        overlay->AddRect(popup_min + ImVec2(1.0f, 1.0f), popup_box_max - ImVec2(1.0f, 1.0f), ImGui::GetColorU32(IM_COL32(52, 52, 56, (int)(255 * open_anim))), 0.0f, 0, 1.0f);

        for (int i = 0; i < items_count; ++i)
        {
            const ImVec2 item_min(popup_min.x + 2.0f, popup_min.y + popup_padding + row_height * i);
            const ImVec2 item_max(popup_min.x + width - 2.0f, item_min.y + row_height);
            const ImRect item_rect(item_min, item_max);
            const bool item_hovered = item_rect.Contains(ImGui::GetIO().MousePos);
            const bool item_pressed = open && open_anim > 0.70f && item_hovered && ImGui::IsMouseClicked(ImGuiMouseButton_Left);
            ImGui::PushID(i);
            const ImGuiID item_id = ImGui::GetID("multicombo_item");
            const float item_hover = AnimateFloat(item_id, item_hovered, 18.0f);
            const float item_selected = AnimateFloat(item_id + 1, values[i], 18.0f);
            const float item_appear = ImClamp((open_anim - i * 0.08f) / 0.45f, 0.0f, 1.0f);
            const ImVec4 row_color = LerpColor(theme.ControlBg, theme.ControlInactive, item_hover * 0.8f + item_selected * 0.4f);
            if (item_hover > 0.01f || item_selected > 0.01f)
                overlay->AddRectFilled(item_min, item_max, ColorU32(row_color, open_anim), 0.0f);
            const ImVec4 text_color = LerpColor(theme.Text, theme.TextBright, item_hover * 0.35f + item_selected * 0.55f);
            if (item_hover > 0.01f)
                overlay->AddRectFilled(item_min, ImVec2(item_min.x + 2.0f, item_max.y), ColorU32(theme.Accent, item_hover * open_anim), 0.0f);
            overlay->AddText(font, font_size, ImVec2(item_min.x + 2.0f + 4.0f * item_hover * Anim::Motion(), item_min.y + 2.0f), ColorU32(text_color, item_appear), items[i]);
            if (item_pressed)
            {
                values[i] = !values[i];
                changed = true;
            }
            ImGui::PopID();
        }
        overlay->PopClipRect();
    }
    ImGui::PopID();
    return changed;
}

// Drop-in for ImGui::Button at the current cursor: lifts, glows, sheen sweep on hover-in, flash on click.
inline bool Button(const char* label, const ImVec2& size)
{
    const char* display = label;
    const char* hash = strstr(label, "##");
    std::string displayStr;
    if (hash) displayStr.assign(label, hash - label), display = displayStr.c_str();
    const ImVec2 cur = ImGui::GetCursorScreenPos();
    const ImVec2 origin(std::floor(cur.x), std::floor(cur.y));
    ImGui::PushID(label);
    ImGui::SetCursorScreenPos(origin);
    const bool clicked = ImGui::InvisibleButton("##oxide_btn", size);
    const bool pressed = clicked && !PopupBlocking();
    const ImGuiID id = ImGui::GetItemID();
    const bool hovered = ImGui::IsItemHovered() && !PopupBlocking();
    const bool held = ImGui::IsItemActive();
    const float hover = Anim::Bool(id, hovered, 14.0f);
    const float press = Anim::Bool(id + 1, held, 24.0f);
    float& wasHovered = Anim::Store()[id + 4];
    if (hovered && wasHovered < 0.5f)
        Anim::Trigger(id + 3);
    wasHovered = hovered ? 1.0f : 0.0f;
    if (pressed)
        Anim::Trigger(id + 2);

    const Theme& theme = GetTheme();
    ImDrawList* draw = ImGui::GetWindowDrawList();
    const float dy = std::floor((-1.0f * hover + 1.5f * press) * Anim::Motion() + 0.5f);
    const ImVec2 bmin(origin.x, origin.y + dy);
    const ImVec2 bmax(bmin.x + size.x, bmin.y + size.y);
    if (hover > 0.01f)
        draw->AddRectFilled(bmin + ImVec2(1.0f, 2.0f), bmax + ImVec2(-1.0f, 3.0f), IM_COL32(0, 0, 0, static_cast<int>(70.0f * hover)), 4.0f);
    Anim::Glow(draw, bmin, bmax, theme.Accent, 0.30f * hover, 4.0f, 5.0f, 3);
    ImVec4 bg = LerpColor(theme.ControlBg, theme.ControlInactive, hover * 0.8f);
    bg = LerpColor(bg, theme.Accent, press * 0.30f);
    draw->AddRectFilled(bmin, bmax, ColorU32(bg), 4.0f);

    draw->PushClipRect(bmin, bmax, true);
    const float sheen = Anim::Elapsed(id + 3, 0.55f);
    if (sheen >= 0.0f) {
        const float x = ImLerp(bmin.x - 24.0f, bmax.x + 24.0f, Anim::InOutSine(sheen));
        const ImU32 clear = IM_COL32(255, 255, 255, 0);
        const ImU32 lit = IM_COL32(255, 255, 255, static_cast<int>(38.0f * (1.0f - sheen)));
        draw->AddRectFilledMultiColor(ImVec2(x - 14.0f, bmin.y), ImVec2(x, bmax.y), clear, lit, lit, clear);
        draw->AddRectFilledMultiColor(ImVec2(x, bmin.y), ImVec2(x + 14.0f, bmax.y), lit, clear, clear, lit);
    }
    const float flash = Anim::Elapsed(id + 2, 0.35f);
    if (flash >= 0.0f)
        draw->AddRectFilled(bmin, bmax, ColorU32(theme.Accent, 0.35f * (1.0f - flash)), 4.0f);
    draw->PopClipRect();

    draw->AddRect(bmin, bmax, ColorU32(LerpColor(ImVec4(theme.Border.x, theme.Border.y, theme.Border.z, theme.Border.w * 0.5f), theme.Accent, hover * 0.9f)), 4.0f, 0, 1.0f);
    const Fonts& fonts = GetFonts();
    ImFont* font = fonts.CascadiaMonoBL ? fonts.CascadiaMonoBL : ImGui::GetFont();
    const float fs = 12.0f * g_fontScale;
    const ImVec2 ts = font->CalcTextSizeA(fs, FLT_MAX, 0.0f, display);
    draw->AddText(font, fs, ImVec2(std::floor(bmin.x + (size.x - ts.x) * 0.5f), std::floor(bmin.y + (size.y - ts.y) * 0.5f)),
                  ColorU32(LerpColor(theme.Text, theme.TextBright, 0.55f + 0.45f * hover)), display);
    ImGui::PopID();
    return pressed;
}
}
