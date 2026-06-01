import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AbsoluteFill } from 'remotion';
export function StoryPost({ hook, caption, hashtags, primaryColor = '#1a1a2e', secondaryColor = '#0d0d1a', accentColor = '#e94560', fontPrimary = 'Inter', logoUrl, watermarkUrl, }) {
    return (_jsxs(AbsoluteFill, { style: {
            background: `linear-gradient(180deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            fontFamily: fontPrimary,
            color: '#fff',
        }, children: [logoUrl && (_jsx("img", { src: logoUrl, alt: "", style: {
                    position: 'absolute',
                    top: 120,
                    left: 80,
                    height: 64,
                    objectFit: 'contain',
                } })), _jsx("div", { style: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, background: accentColor } }), _jsx("div", { style: {
                    position: 'absolute',
                    top: '35%',
                    left: 80,
                    right: 80,
                    fontSize: 96,
                    fontWeight: 900,
                    lineHeight: 1.1,
                }, children: hook }), _jsx("div", { style: {
                    position: 'absolute',
                    top: '62%',
                    left: 80,
                    right: 80,
                    fontSize: 44,
                    lineHeight: 1.5,
                    opacity: 0.75,
                }, children: caption }), _jsx("div", { style: {
                    position: 'absolute',
                    bottom: 200,
                    left: 80,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 14,
                    fontSize: 32,
                    opacity: 0.55,
                }, children: hashtags.slice(0, 3).map((t) => (_jsxs("span", { children: ["#", t] }, t))) }), watermarkUrl && (_jsx("img", { src: watermarkUrl, alt: "", style: {
                    position: 'absolute',
                    bottom: 100,
                    right: 80,
                    height: 56,
                    opacity: 0.35,
                } }))] }));
}
