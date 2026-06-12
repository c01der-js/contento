import { registerRoot } from 'remotion'
import { RemotionRoot } from './remotion-root.js'

// The one and only Remotion bundle entry. bundle() entryPoints MUST call
// registerRoot() — pointing at remotion-root.tsx directly fails at
// selectComposition with "registerRoot() was not called".
registerRoot(RemotionRoot)
