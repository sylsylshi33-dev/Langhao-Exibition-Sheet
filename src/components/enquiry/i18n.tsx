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
  brandName: "陕西朗昊",
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
    disclaimer: "您的信息仅用于本次展会的后续跟进与联系。",
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
    nameHint: "请先告诉我们您的姓名，之后可上传名片或手动填写其他联系方式。",
    nameRequired: "请填写您的姓名。",
    manualHint: "带 * 的为必填项。",
    continueHint: "请先填写姓名；并填写公司、邮箱和国家 / 地区，或改用上传名片。",
  },

  products: {
    title: "您对哪些产品感兴趣？",
    subtitle:
      "可以添加多个产品。每个产品请上传产品照片，或直接填写产品编号 / SKU（也可以两者都提供）。",
    productN: (n: number) => `产品 ${n}`,
    labelInstruction: "请拍摄产品标签，建议拍摄产品底部的标签。",
    photoOrSku: "请上传产品照片，或填写下方的产品编号 / SKU，二选一即可，也可以都提供。",
    takePhoto: "拍照",
    uploadPhoto: "从相册上传",
    removePhotoAria: "移除照片",
    removeProduct: "删除此产品",
    removeProductAria: (n: number) => `删除产品 ${n}`,
    maxPhotos: (max: number) => `每个产品最多 ${max} 张照片`,
    maxTotalPhotos: (max: number) => `整份咨询最多 ${max} 张照片`,
    photoCount: (n: number) => `已添加 ${n} 张照片 · 点按照片右上角可移除`,
    skuLabel: "产品编号 / SKU",
    skuPlaceholder: "例如 RX-200",
    colourLabel: "颜色",
    colourPlaceholder: "例如 黑色",
    quantityLabel: "数量",
    quantityPlaceholder: "例如 500 件",
    packagingLabel: "包装要求",
    packagingPlaceholder: "例如 彩盒包装、每箱 20 件、贴客户标签",
    recommended: "建议填写",
    addProduct: "添加另一个产品",
    productCount: (n: number, max: number) => `已添加 ${n} / ${max} 个产品`,
    maxProducts: (max: number) => `最多可添加 ${max} 个产品`,
    needPhotoOrSku: "请上传产品照片，或填写产品编号 / SKU。",
    fixErrors: "请先补充标有红色提示的产品信息，再继续。",
    emptyHint:
      "暂时不确定也没关系，可直接进入下一步，稍后由销售人员协助确认产品。",
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
      products: "产品",
      interest: "需求",
      message: "留言",
    },
    uploaded: "已上传",
    notUploaded: "未上传",
    photoCount: (n: number) => `${n} 张照片`,
    productCount: (n: number) => `${n} 个产品`,
    reachPrefix: { phone: "手机", email: "邮箱", wechat: "微信" },
    submit: "提交咨询",
    submitting: "提交中…",
    submitError: "提交失败，请稍后重试。",
    submitErrorInvalid: "信息填写有误，请返回检查后重试。",
    submitErrorTooLarge: "照片文件过大，请减少照片数量或更换照片后重试。",
    submitErrorBusy: "提交过于频繁，请稍后再试。",
    submitErrorNetwork: "网络不稳定，提交未完成。请检查网络后再次点击提交，信息不会重复。",
    uploading: (percent: number) => `上传中 ${percent}%`,
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
  brandName: "SHAANXI LANGHAO",
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
    disclaimer: "Your information is only used to follow up after this event.",
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
      name: "Full name",
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
    nameHint: "Tell us your name first, then upload a business card or enter your other contact details.",
    nameRequired: "Please enter your full name.",
    manualHint: "Fields marked * are required.",
    continueHint: "Enter your full name, plus company, email and country — or upload a business card instead.",
  },

  products: {
    title: "Which products are you interested in?",
    subtitle:
      "You can add several products. For each one, upload a product photo or enter its product number / SKU (or both).",
    productN: (n: number) => `Product ${n}`,
    labelInstruction:
      "Please photograph the product label, preferably the label located on the bottom of the product.",
    photoOrSku:
      "Upload a product photo or enter the product number / SKU below — either one is enough, or give both.",
    takePhoto: "Take photo",
    uploadPhoto: "Upload",
    removePhotoAria: "Remove photo",
    removeProduct: "Remove this product",
    removeProductAria: (n: number) => `Remove product ${n}`,
    maxPhotos: (max: number) => `up to ${max} photos per product`,
    maxTotalPhotos: (max: number) => `up to ${max} photos per enquiry`,
    photoCount: (n: number) =>
      `${n} photo${n === 1 ? "" : "s"} added · tap the corner of a photo to remove`,
    skuLabel: "Product number / SKU",
    skuPlaceholder: "e.g. RX-200",
    colourLabel: "Colour",
    colourPlaceholder: "e.g. Black",
    quantityLabel: "Quantity",
    quantityPlaceholder: "e.g. 500 pcs",
    packagingLabel: "Packaging requirements",
    packagingPlaceholder: "e.g. Colour box, 20 per carton, customer label",
    recommended: "Recommended",
    addProduct: "Add another product",
    productCount: (n: number, max: number) => `${n} of ${max} products added`,
    maxProducts: (max: number) => `You can add up to ${max} products`,
    needPhotoOrSku: "Please upload a product photo or enter the product number / SKU.",
    fixErrors: "Please complete the products marked in red before continuing.",
    emptyHint:
      "Not sure yet? You can continue and our sales team will help identify the products later.",
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
      products: "Products",
      interest: "Interested in",
      message: "Message",
    },
    uploaded: "Uploaded",
    notUploaded: "Not uploaded",
    photoCount: (n: number) => `${n} photo${n === 1 ? "" : "s"}`,
    productCount: (n: number) => `${n} product${n === 1 ? "" : "s"}`,
    reachPrefix: { phone: "Phone", email: "Email", wechat: "WeChat" },
    submit: "Submit enquiry",
    submitting: "Submitting…",
    submitError: "Something went wrong — please try again shortly.",
    submitErrorInvalid: "Some details look wrong — please go back, check them and try again.",
    submitErrorTooLarge: "Your photos are too large — please remove some or choose different ones and try again.",
    submitErrorBusy: "Too many submissions right now — please try again in a moment.",
    submitErrorNetwork: "The connection is unstable and your enquiry was not sent. Check your network and tap submit again — it won't be duplicated.",
    uploading: (percent: number) => `Uploading ${percent}%`,
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
