// Provider brand marks. Slugs mirror RAGFlow's IconMap
// (ragflow-be/web/src/constants/llm.ts); providers in SVG_SLUGS ship a file under
// /provider-logos, the rest resolve through the self-hosted iconfont sprite
// (/iconfont.js), and anything unknown falls back to initials.
const PROVIDER_ICONS = {
  "Tongyi-Qianwen": "tongyi-qianwen", "Moonshot": "moonshot", "OpenAI": "openai", "ZHIPU-AI": "zhipu",
  "文心一言": "wenxinyiyan", "Ollama": "ollama", "Xinference": "xinference", "ModelScope": "modelscope",
  "DeepSeek": "deepseek", "VolcEngine": "volcengine", "BaiChuan": "baichuan", "Jina": "jina",
  "MiniMax": "MiniMax", "Mistral": "mistral", "Azure-OpenAI": "azure", "Bedrock": "bedrock",
  "Gemini": "gemini", "Groq": "groq-next", "OpenRouter": "open-router", "LocalAI": "local-ai",
  "StepFun": "stepfun", "NVIDIA": "nvidia", "LM-Studio": "lm-studio", "OpenAI-API-Compatible": "openai-api",
  "Cohere": "cohere", "LeptonAI": "lepton", "TogetherAI": "together", "PerfXCloud": "perfx-cloud",
  "Upstage": "upstage", "NovitaAI": "novita-ai", "SILICONFLOW": "siliconflow", "PPIO": "ppio",
  "Replicate": "replicate", "Tencent Hunyuan": "hunyuan", "XunFei Spark": "spark", "BaiduYiyan": "wenxinyiyan",
  "Fish Audio": "fish-audio", "Tencent Cloud": "tencent-cloud", "Anthropic": "anthropic", "Voyage AI": "voyage",
  "Google Cloud": "google-cloud", "HuggingFace": "huggingface", "Youdao": "youdao", "BAAI": "baai",
  "nomic-ai": "nomic-ai", "jinaai": "jina", "sentence-transformers": "sentence-transformers", "GPUStack": "gpustack",
  "VLLM": "vllm", "GiteeAI": "gitee-ai", "302.AI": "ai302", "DeepInfra": "deepinfra",
  "Grok": "grok", "xAI": "xai", "TokenPony": "tokenpony", "Meituan": "longcat",
  "LongCat": "longcat", "CometAPI": "cometapi", "DeerAPI": "deerapi", "Jiekou.AI": "jiekouai",
  "Builtin": "builtin", "MinerU": "mineru", "MinerU.Net": "mineru", "PaddleOCR": "paddleocr",
  "PaddleOCR.local": "paddleocr", "N1n": "n1n", "Avian": "avian", "RAGcon": "ragcon",
  "Perplexity": "perplexity", "Astraflow": "astraflow", "Astraflow-CN": "astraflow", "FastEmbed": "fastembed",
  "FuturMix": "futurmix", "siliconflow_intl": "siliconflow", "Xiaomi": "xiaomi", "HuaweiCloud": "huaweicloud",
  "OrcaRouter": "orcarouter", "Qiniu": "qiniu", "TokenHub": "tokenhub", "SoMark": "somark",
  "New API": "new-api", "DaoXE": "daoxe", "FunASR": "funasr", "aimlapi.com": "aimlapi",
  "GreenPT": "greenpt", "Synthorai": "synthorai", "API-Route": "apiroute", "MWS": "mws",
  "Cheaper Inference": "cheaperinference",
};

// Slugs shipped as /provider-logos/<slug>.svg (RAGFlow's svgIcons list).
// `-bright` is the light-background variant of a themed mark (see THEME_PROVIDERS).
const SVG_SLUGS = new Set([
  "local-ai", "gemini", "stepfun", "mineru-bright", "paddleocr", "n1n", "avian", "ragcon", "somark",
  "new-api", "daoxe", "astraflow", "futurmix", "xiaomi", "youdao", "baai", "nomic-ai", "sentence-transformers",
  "grok", "fastembed", "huaweicloud", "orcarouter", "qiniu", "tokenhub", "funasr", "aimlapi", "greenpt",
  "synthorai", "apiroute", "mws", "cheaperinference",
]);

// Providers whose mark has a light/dark variant; NEXO renders dark, so the file
// logo uses the light-background (`-bright`) art on its light plate and the
// iconfont symbol uses the dark-background (`-dark`) art.
const THEME_PROVIDERS = new Set([
  "Fish Audio", "TogetherAI", "Meituan", "LongCat", "MinerU", "MinerU.Net", "Jiekou.AI", "Perplexity",
]);

const initials = name => String(name ?? "?").replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";

// /iconfont.js injects its symbols on DOMContentLoaded, so a synchronous render
// can precede the sprite. Reference the symbol optimistically until the sprite is
// present; <use> resolves as soon as the symbol exists. Only once the sprite has
// loaded do we trust a missing id and fall back to initials.
const spriteReady = () => typeof document !== "undefined" && document.querySelector('symbol[id^="icon-"]') !== null;

export function providerLogo(name, size = 26) {
  const slug = PROVIDER_ICONS[name];
  if (slug) {
    const themed = THEME_PROVIDERS.has(name);
    const fileSlug = themed ? `${slug}-bright` : slug;
    if (SVG_SLUGS.has(fileSlug)) {
      return `<img class="provider-logo provider-logo-file" src="/provider-logos/${fileSlug}.svg" alt="" width="${size}" height="${size}" loading="lazy" decoding="async">`;
    }
    const symbolSlug = themed ? `${slug}-dark` : slug;
    if (!spriteReady() || document.getElementById(`icon-${symbolSlug}`)) {
      // Symbols carry their own fills; the ones without any inherit currentColor,
      // which must stay light against the dark tile.
      return `<svg class="provider-logo provider-logo-symbol" width="${size}" height="${size}" fill="currentColor" aria-hidden="true"><use href="#icon-${symbolSlug}"></use></svg>`;
    }
  }
  return `<span class="provider-logo provider-logo-initials" style="width:${size}px;height:${size}px" aria-hidden="true">${initials(name)}</span>`;
}
