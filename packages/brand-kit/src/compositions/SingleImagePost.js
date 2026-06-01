import { jsx as _jsx } from "react/jsx-runtime";
import { AbsoluteFill } from 'remotion';
import { BrandCard } from '../components/BrandCard.js';
export function SingleImagePost(props) {
    return (_jsx(AbsoluteFill, { children: _jsx(BrandCard, { ...props }) }));
}
