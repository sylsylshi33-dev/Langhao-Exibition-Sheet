"use client";

/*
 * Tiny bilingual (中 / EN) layer for the customer-facing flow.
 *
 * All user-visible copy lives in `STRINGS`. Components read the current
 * bundle with `useI18n()`. The choice is per-visitor and remembered in
 * localStorage. Chinese is the default.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const STORAGE_KEY = "lead-capture.lang";

const zh = {
  brandName: "锐岭工业",
  demoBadge: "演示",
  langLabel: { zh: "中", en: "EN" },

  common: {
    back: "上一步",
    next: "下一步",
    add: "添加",
    remove: "移除",
    optional: "选填",
  },

  header: { backAria: "返回上一步" },

  progress: {
    step: (n: number, total: number) => `步骤 ${n} / ${total}`,
    contact: "联系方式",
    products: "产品照片",
    request: "需求",
    submit: "提交",
  },

  landing: {
    title: "对我们的产品感兴趣？",
    subtitle:
      "留下您的联系方式，并告诉我们您想进一步了解哪些产品。展会结束后，我们的团队会尽快与您联系。",
    points: [
      "大约 1 分钟即可完成",
      "支持上传名片，无需逐项填写",
      "专人跟进，为您提供资料与报价",
    ],
    cta: "提交咨询",
    disclaimer: "本页面为演示 Demo，信息仅用于功能展示。",
  },

  contact: {
    title: "您的联系方式",
    subtitle: "上传名片，或手动填写关键信息，两种方式都可以。",
    modeCard: "上传名片",
    modeManual: "手动填写",
    takePhoto: "拍照",
    uploadPhoto: "从相册上传",
    cardPrompt: "拍摄或上传一张名片照片",
    replace: "重新上传",
    removeCardAria: "移除名片",
    cardHint: "我们会根据名片信息与您联系。如需补充，可切换到「手动填写」。",
    fields: {
      name: "姓名",
      company: "公司",
      email: "邮箱",
      country: "国家 / 地区",
      jobTitle: "职位",
      phone: "手机",
      wechat: "微信",
    },
    placeholders: {
      name: "请输入姓名",
      company: "公司名称",
      email: "name@example.com",
      country: "例如 中国",
      jobTitle: "您的职位",
      phone: "手机号码",
      wechat: "微信号",
    },
    manualHint: "带 * 的为必填项。",
    continueHint: "请填写姓名、公司、邮箱和国家 / 地区，或改用上传名片。",
  },

  products: {
    title: "您对哪些产品感兴趣？",
    subtitle:
      "可以拍照或上传您感兴趣的产品，我们的团队会为您进一步提供信息。",
    takePhoto: "拍照",
    uploadPhoto: "从相册上传",
    removePhotoAria: "移除照片",
    photoCount: (n: number) => `已添加 ${n} 张照片 · 点按照片右上角可移除`,
    emptyHint:
      "暂时没有照片也没关系，可直接进入下一步，稍后由销售人员协助确认产品。",
    modelsLabel: "产品型号 / 编号（选填）",
    modelsHint: "如果您知道展品的型号或编号，请填写，可添加多个。",
    modelPlaceholder: "例如 RX-200",
    removeModelAria: "移除型号",
  },

  request: {
    title: "您希望进一步了解什么？",
    subtitle: "可多选。",
    messageLabel: "还有其他需求吗？",
    messagePlaceholder: "请输入您的需求...",
  },

  requestOptions: {
    产品资料: { label: "产品资料", hint: "规格、目录、说明文档" },
    报价: { label: "报价", hint: "价格与商务条款" },
    定制方案: { label: "定制方案", hint: "针对具体场景的方案建议" },
    其他: { label: "其他", hint: "在下方留言中补充说明" },
  },

  review: {
    title: "确认并提交",
    subtitle: "请确认以下信息，提交后我们的团队会尽快与您联系。",
    edit: "修改",
    rows: {
      contact: "联系人",
      country: "国家 / 地区",
      reach: "联系方式",
      card: "名片",
      photos: "产品照片",
      models: "产品型号",
      interest: "需求",
      message: "留言",
    },
    uploaded: "已上传",
    notUploaded: "未上传",
    photoCount: (n: number) => `${n} 张`,
    reachPrefix: { phone: "手机", email: "邮箱", wechat: "微信" },
    submit: "提交咨询",
    submitting: "提交中…",
    none: "—",
  },

  success: {
    title: "感谢您的咨询！",
    body: "我们已收到您的需求，工作人员会尽快与您联系。",
    reference: "咨询编号",
    restart: "返回首页",
  },
};

type Bundle = typeof zh;

const en: Bundle = {
  brandName: "Ridgeline",
  demoBadge: "DEMO",
  langLabel: { zh: "中", en: "EN" },

  common: {
    back: "Back",
    next: "Next",
    add: "Add",
    remove: "Remove",
    optional: "optional",
  },

  header: { backAria: "Go back" },

  progress: {
    step: (n: number, total: number) => `Step ${n} / ${total}`,
    contact: "Contact",
    products: "Photos",
    request: "Request",
    submit: "Submit",
  },

  landing: {
    title: "Interested in our products?",
    subtitle:
      "Leave your details and tell us which products you'd like to know more about. Our team will follow up shortly after the show.",
    points: [
      "Takes about a minute",
      "Upload a business card — no need to type every field",
      "A dedicated rep follows up with information and quotes",
    ],
    cta: "Start enquiry",
    disclaimer: "This is a demo page. Information is used for demonstration only.",
  },

  contact: {
    title: "Your contact details",
    subtitle: "Upload a business card or enter the key details manually — either works.",
    modeCard: "Business card",
    modeManual: "Enter manually",
    takePhoto: "Take photo",
    uploadPhoto: "Upload",
    cardPrompt: "Take or upload a photo of a business card",
    replace: "Replace",
    removeCardAria: "Remove card",
    cardHint:
      "We'll contact you using the details on the card. Switch to “Enter manually” to add more.",
    fields: {
      name: "Name",
      company: "Company",
      email: "Email",
      country: "Country / region",
      jobTitle: "Job title",
      phone: "Phone",
      wechat: "WeChat",
    },
    placeholders: {
      name: "Your name",
      company: "Company name",
      email: "name@example.com",
      country: "e.g. China",
      jobTitle: "Your role",
      phone: "Phone number",
      wechat: "WeChat ID",
    },
    manualHint: "Fields marked * are required.",
    continueHint: "Fill in name, company, email and country — or upload a business card instead.",
  },

  products: {
    title: "Which products are you interested in?",
    subtitle:
      "Take or upload photos of the products you're interested in and our team will follow up with details.",
    takePhoto: "Take photo",
    uploadPhoto: "Upload",
    removePhotoAria: "Remove photo",
    photoCount: (n: number) =>
      `${n} photo${n === 1 ? "" : "s"} added · tap the corner of a photo to remove`,
    emptyHint:
      "No photos is fine — you can continue and our sales team will help identify the products later.",
    modelsLabel: "Product model / item number (optional)",
    modelsHint:
      "If you know the model or item number from the booth, add it here. You can add several.",
    modelPlaceholder: "e.g. RX-200",
    removeModelAria: "Remove model",
  },

  request: {
    title: "What would you like to know more about?",
    subtitle: "Select all that apply.",
    messageLabel: "Anything else?",
    messagePlaceholder: "Tell us what you need...",
  },

  requestOptions: {
    产品资料: { label: "Product information", hint: "Specs, catalogue, documentation" },
    报价: { label: "Quotation", hint: "Pricing and commercial terms" },
    定制方案: { label: "Customization", hint: "Recommendations for your use case" },
    其他: { label: "Other", hint: "Tell us more in the message below" },
  },

  review: {
    title: "Review & submit",
    subtitle: "Please check your details. We'll be in touch soon after you submit.",
    edit: "Edit",
    rows: {
      contact: "Contact",
      country: "Country / region",
      reach: "Reach me at",
      card: "Business card",
      photos: "Product photos",
      models: "Product models",
      interest: "Interested in",
      message: "Message",
    },
    uploaded: "Uploaded",
    notUploaded: "Not uploaded",
    photoCount: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    reachPrefix: { phone: "Phone", email: "Email", wechat: "WeChat" },
    submit: "Submit enquiry",
    submitting: "Submitting…",
    none: "—",
  },

  success: {
    title: "Thank you for your enquiry!",
    body: "We've received your request and will contact you as soon as possible.",
    reference: "Reference",
    restart: "Back to start",
  },
};

export const STRINGS: Record<Lang, Bundle> = { zh, en };

type I18nValue = { lang: Lang; setLang: (lang: Lang) => void; t: Bundle };

const I18nContext = createContext<I18nValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    // Read the saved preference after hydration (rendering the default first
    // keeps server and client markup identical).
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved === "zh" || saved === "en") setLangState(saved);
    } catch {
      /* localStorage unavailable — stick with the default */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t: STRINGS[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}

/** Compact 中 / EN switch. */
export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="flex overflow-hidden rounded-lg border border-slate-200">
      {(["zh", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          className={`px-2.5 py-1 text-xs font-medium transition ${
            lang === l
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-500 hover:text-slate-900"
          }`}
        >
          {t.langLabel[l]}
        </button>
      ))}
    </div>
  );
}
