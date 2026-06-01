import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AbsoluteFill } from 'remotion';
export function CarouselPost({ hook, hashtags, primaryColor = '#1a1a2e', secondaryColor = '#16213e', accentColor = '#0f3460', fontPrimary = 'Inter', logoUrl, watermarkUrl, }) {
    return (_jsxs(AbsoluteFill, { style: {
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            fontFamily: fontPrimary,
            color: '#fff',
        }, children: [_jsx("div", { style: {
                    position: 'absolute',
                    top: 48,
                    right: 60,
                    display: 'flex',
                    gap: 10,
                }, children: [0, 1, 2].map((i) => (_jsx("div", { style: {
                        width: i === 0 ? 32 : 12,
                        height: 12,
                        borderRadius: 6,
                        background: i === 0 ? accentColor : 'rgba(255,255,255,0.35)',
                    } }, i))) }), _jsx("div", { style: {
                    position: 'absolute',
                    top: 48,
                    left: 60,
                    fontSize: 28,
                    opacity: 0.5,
                    letterSpacing: 2,
                }, children: "01 / INTRO" }), _jsx("div", { style: {
                    position: 'absolute',
                    top: '28%',
                    left: 60,
                    right: 60,
                    fontSize: 72,
                    fontWeight: 800,
                    lineHeight: 1.2,
                }, children: hook }), _jsxs("div", { style: {
                    position: 'absolute',
                    bottom: 100,
                    left: 60,
                    right: 60,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 16,
                    fontSize: 30,
                    opacity: 0.55,
                }, children: [_jsx("span", { children: "Swipe for more" }), _jsx("span", { children: "\u2192" })] }), _jsx("div", { style: {
                    position: 'absolute',
                    bottom: 48,
                    left: 60,
                    display: 'flex',
                    gap: 10,
                    fontSize: 24,
                    opacity: 0.5,
                }, children: hashtags.slice(0, 3).map((t) => (_jsxs("span", { children: ["#", t] }, t))) }), logoUrl && (_jsx("img", { src: logoUrl, alt: "", style: {
                    position: 'absolute',
                    top: 44,
                    right: 60,
                    height: 56,
                    objectFit: 'contain',
                } })), watermarkUrl && (_jsx("img", { src: watermarkUrl, alt: "", style: {
                    position: 'absolute',
                    bottom: 44,
                    right: 60,
                    height: 44,
                    opacity: 0.4,
                } }))] }));
}
