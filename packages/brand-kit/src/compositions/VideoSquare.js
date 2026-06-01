import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AbsoluteFill, useCurrentFrame, interpolate } from 'remotion';
export function VideoSquare({ hook, body, cta, primaryColor = '#1a1a2e', secondaryColor = '#16213e', accentColor = '#0f3460', fontPrimary = 'Inter', watermarkUrl, logoUrl, }) {
    const frame = useCurrentFrame();
    const hookOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: 'clamp' });
    const hookY = interpolate(frame, [0, 30], [30, 0], { extrapolateRight: 'clamp' });
    const bodyOpacity = interpolate(frame, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const bodyY = interpolate(frame, [60, 90], [20, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const ctaOpacity = interpolate(frame, [200, 230], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (_jsxs(AbsoluteFill, { style: {
            background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
            fontFamily: fontPrimary,
            color: '#fff',
        }, children: [_jsx("div", { style: {
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 8,
                    background: accentColor,
                } }), logoUrl && (_jsx("img", { src: logoUrl, alt: "", style: {
                    position: 'absolute',
                    top: 48,
                    left: 60,
                    height: 56,
                    objectFit: 'contain',
                } })), _jsx("div", { style: {
                    position: 'absolute',
                    top: '22%',
                    left: 60,
                    right: 60,
                    fontSize: 80,
                    fontWeight: 900,
                    lineHeight: 1.15,
                    opacity: hookOpacity,
                    transform: `translateY(${hookY}px)`,
                }, children: hook }), body && (_jsx("div", { style: {
                    position: 'absolute',
                    top: '55%',
                    left: 60,
                    right: 60,
                    fontSize: 40,
                    lineHeight: 1.5,
                    opacity: bodyOpacity * 0.8,
                    transform: `translateY(${bodyY}px)`,
                }, children: body })), cta && (_jsx("div", { style: {
                    position: 'absolute',
                    bottom: 120,
                    left: 60,
                    right: 60,
                    fontSize: 44,
                    fontWeight: 700,
                    color: accentColor,
                    opacity: ctaOpacity,
                }, children: cta })), watermarkUrl && (_jsx("img", { src: watermarkUrl, alt: "", style: {
                    position: 'absolute',
                    bottom: 48,
                    right: 60,
                    height: 48,
                    opacity: 0.35,
                    objectFit: 'contain',
                } }))] }));
}
