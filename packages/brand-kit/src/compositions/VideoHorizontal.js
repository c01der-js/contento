import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
export function VideoHorizontal({ hook, body, cta, primaryColor = '#1a1a2e', secondaryColor = '#16213e', accentColor = '#0f3460', fontPrimary = 'Inter', watermarkUrl, logoUrl, }) {
    const frame = useCurrentFrame();
    const hookOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
    const hookX = interpolate(frame, [0, 30], [-40, 0], { extrapolateRight: 'clamp' });
    const bodyOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const bodyX = interpolate(frame, [60, 90], [-30, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const ctaOpacity = interpolate(frame, [300, 330], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (_jsxs(AbsoluteFill, { style: {
            background: `linear-gradient(120deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            fontFamily: fontPrimary,
            color: '#fff',
        }, children: [_jsx("div", { style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: 8,
                    bottom: 0,
                    background: accentColor,
                } }), logoUrl && (_jsx("img", { src: logoUrl, alt: "", style: {
                    position: 'absolute',
                    top: 60,
                    left: 80,
                    height: 64,
                    objectFit: 'contain',
                } })), _jsx("div", { style: {
                    position: 'absolute',
                    top: '25%',
                    left: 80,
                    right: '45%',
                    fontSize: 96,
                    fontWeight: 900,
                    lineHeight: 1.1,
                    opacity: hookOpacity,
                    transform: `translateX(${hookX}px)`,
                }, children: hook }), body && (_jsx("div", { style: {
                    position: 'absolute',
                    top: '30%',
                    left: '55%',
                    right: 80,
                    fontSize: 42,
                    lineHeight: 1.6,
                    opacity: bodyOpacity * 0.8,
                    transform: `translateX(${bodyX}px)`,
                }, children: body })), cta && (_jsx("div", { style: {
                    position: 'absolute',
                    bottom: 100,
                    left: 80,
                    fontSize: 52,
                    fontWeight: 700,
                    color: accentColor,
                    opacity: ctaOpacity,
                }, children: cta })), watermarkUrl && (_jsx("img", { src: watermarkUrl, alt: "", style: {
                    position: 'absolute',
                    bottom: 60,
                    right: 80,
                    height: 52,
                    opacity: 0.35,
                    objectFit: 'contain',
                } }))] }));
}
