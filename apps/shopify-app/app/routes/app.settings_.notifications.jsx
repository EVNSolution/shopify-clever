/* eslint-disable react/prop-types */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  fetchCustomerEmailSettings,
  saveCustomerEmailGlobal,
  saveCustomerEmailTemplate,
  sendCustomerEmailTest,
  uploadCustomerEmailLogo,
} from "../features/customer-notifications/customer-email.server";
import {
  TemplateTokenEditor,
} from "../features/customer-notifications/template-token-editor";
import {
  hasUnsupportedTemplateSegments,
  parseTemplateDocument,
} from "../features/customer-notifications/template-document";
import {
  SettingsLayout,
  settingsActionRowStyle,
  settingsButtonStyle,
  settingsCoordinateGridStyle,
  settingsDisabledButtonStyle,
  settingsErrorStyle,
  settingsFieldsetStyle,
  settingsFormStyle,
  settingsInputStyle,
  settingsLabelStyle,
  settingsLegendStyle,
  settingsMessageStyle,
  settingsResetButtonStyle,
  settingsSaveStatusStyle,
  settingsSectionCardStyle,
  settingsSelectStyle,
  settingsTemplateTabsStyle,
  settingsTextareaStyle,
} from "../features/settings/settings-layout";
import { authenticate } from "../shopify.server";
import { PageShell } from "../ui/page-shell";

const CUSTOMER_EMAIL_SIGNALS = [
  ["DELIVERY_SCHEDULED", "Delivery scheduled"],
  ["OUT_FOR_DELIVERY", "Out for delivery"],
  ["DRIVER_NEARBY", "Driver is nearby"],
  ["DELIVERED", "Delivered"],
  ["MISSED_DELIVERY", "Missed delivery"],
];

const CUSTOMER_EMAIL_LOGO_ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CUSTOMER_EMAIL_LOGO_MAX_BYTES = 1024 * 1024;

const DEFAULT_BRANDING = {
  address: "",
  businessName: "",
  contactEmail: "",
  logoLinkUrl: "",
  logoMode: "hidden",
  logoUrl: "",
  logoWidth: 160,
  note: "",
  phone: "",
  websiteUrl: "",
};

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shopifyShopCacheKey = session?.shop;
  const customerEmailResult = await fetchCustomerEmailSettings(request, {
    cacheKey: shopifyShopCacheKey,
  });

  return {
    customerEmailSettings: customerEmailResult.customerEmailSettings,
    errors: customerEmailResult.errors ?? [],
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();

  if (formData.get("_intent") === "saveCustomerEmailGlobal") {
    return saveCustomerEmailGlobal(request, readCustomerEmailGlobalSettings(formData), {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
  }

  if (formData.get("_intent") === "saveCustomerEmailTemplate") {
    const payload = readCustomerEmailTemplateSettings(formData);
    if (payload.errors.length > 0) return payload;

    return saveCustomerEmailTemplate(request, payload.signal, payload.customerEmailTemplate, {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
  }

  if (formData.get("_intent") === "uploadCustomerEmailLogo") {
    const uploadFormData = new FormData();
    const logo = formData.get("logo");
    if (logo) uploadFormData.set("logo", logo);

    const result = await uploadCustomerEmailLogo(request, uploadFormData, {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
    return Response.json(result);
  }

  if (formData.get("_intent") === "testCustomerEmail") {
    const attemptId = formText(formData.get("attemptId")) || crypto.randomUUID();
    const recipientEmail = formText(formData.get("recipientEmail"));
    const signal = formText(formData.get("signal"));
    console.info("customer_email.test.action.received", {
      attemptId,
      recipientDomain: emailDomain(recipientEmail),
      signal,
    });
    const result = await sendCustomerEmailTest(request, {
      attemptId,
      body: formText(formData.get("body")),
      confirmed: formData.get("confirmed") === "true",
      recipientEmail,
      signal,
      subject: formText(formData.get("subject")),
    }, { sessionToken: formText(formData.get("shopifySessionToken")) });
    console.info("customer_email.test.action.completed", {
      attemptId,
      errorCount: result.errors.length,
      messageId: result.test?.messageId ?? null,
      provider: result.test?.provider ?? null,
    });
    return result;
  }

  return { errors: [{ message: "Unknown notification settings action." }] };
};

function readCustomerEmailGlobalSettings(formData) {
  return {
    expectedVersion: formNullableText(formData.get("expectedVersion")),
    branding: {
      address: formText(formData.get("branding.address")),
      businessName: formText(formData.get("branding.businessName")),
      contactEmail: formText(formData.get("branding.contactEmail")),
      note: formText(formData.get("branding.note")),
      phone: formText(formData.get("branding.phone")),
      websiteUrl: formHttpsUrl(formData.get("branding.websiteUrl")),
      logoLinkUrl: formHttpsUrl(formData.get("branding.logoLinkUrl")),
      logoMode: formText(formData.get("branding.logoMode")) || DEFAULT_BRANDING.logoMode,
      logoUrl: formHttpsUrl(formData.get("branding.logoUrl")),
      logoWidth: numberFromFormValue(formData.get("branding.logoWidth")) ?? DEFAULT_BRANDING.logoWidth,
    },
    replyTo: formText(formData.get("replyTo")),
    senderEmail: formText(formData.get("senderEmail")),
    senderName: formText(formData.get("senderName")),
  };
}

function readCustomerEmailTemplateSettings(formData) {
  const signal = formText(formData.get("templateSignal"));
  const body = formText(formData.get("body"));
  const subject = formText(formData.get("subject"));
  const enabled = formData.get("enabled") === "true";

  if (!CUSTOMER_EMAIL_SIGNALS.some(([candidate]) => candidate === signal)) {
    return {
      customerEmailTemplate: null,
      errors: [{ code: "CUSTOMER_EMAIL_TEMPLATE_SIGNAL_INVALID", message: "Choose a supported notification template.", status: 400 }],
      signal: null,
    };
  }

  if (
    hasUnsupportedTemplateSegments(parseTemplateDocument(subject))
    || hasUnsupportedTemplateSegments(parseTemplateDocument(body))
  ) {
    return {
      customerEmailTemplate: null,
      errors: [{ code: "CUSTOMER_EMAIL_TEMPLATE_VARIABLE_UNSUPPORTED", message: "Remove unsupported variables before saving this template.", status: 400 }],
      signal,
    };
  }

  return {
    customerEmailTemplate: {
      body,
      enabled,
      expectedVersion: formNullableText(formData.get("expectedVersion")),
      subject,
    },
    errors: [],
    signal,
  };
}

function normalizeCustomerEmailSettings(settings) {
  const templates = settings?.templates ?? {};
  const branding = settings?.branding ?? {};
  const sender = settings?.sender ?? {};

  return {
    branding: {
      address: branding.address ?? "",
      businessName: branding.businessName ?? "",
      contactEmail: branding.contactEmail ?? "",
      note: branding.note ?? branding.footerText ?? "",
      logoLinkUrl: branding.logoLinkUrl ?? "",
      logoMode: branding.logoMode ?? DEFAULT_BRANDING.logoMode,
      logoUrl: branding.logoUrl ?? "",
      logoWidth: branding.logoWidth ?? DEFAULT_BRANDING.logoWidth,
      phone: branding.phone ?? "",
      websiteUrl: branding.websiteUrl ?? "",
    },
    replyTo: settings?.replyTo ?? "",
    senderEmail: settings?.senderEmail ?? sender.email ?? "",
    senderName: settings?.senderName ?? sender.name ?? "",
    templates: Object.fromEntries(CUSTOMER_EMAIL_SIGNALS.map(([signal]) => [signal, {
      body: templates?.[signal]?.body ?? "",
      enabled: templates?.[signal]?.enabled ?? true,
      subject: templates?.[signal]?.subject ?? "",
      version: templates?.[signal]?.version ?? null,
    }])),
    globalVersion: settings?.globalVersion ?? settings?.settingsVersion ?? null,
  };
}

function formText(value) {
  if (value == null) return "";

  return String(value).trim();
}

function formNullableText(value) {
  const text = formText(value);
  return text || null;
}

function formHttpsUrl(value) {
  const url = formText(value);
  return url.startsWith("https://") ? url : "";
}

function numberFromFormValue(value) {
  if (value == null || value === "") return undefined;
  const number = Number(value);

  return Number.isFinite(number) ? number : undefined;
}

function emailDomain(value) {
  const separator = value.lastIndexOf("@");
  return separator >= 0 ? value.slice(separator + 1).trim().toLowerCase() || null : null;
}

export default function CustomerNotificationsSettingsPage() {
  const { customerEmailSettings, errors: loaderErrors } = useLoaderData();

  return (
    <PageShell title="Settings">
      <SettingsLayout>
        {loaderErrors?.length > 0 ? (
          <p role="alert" style={settingsErrorStyle}>{loaderErrors[0]?.message ?? "Unable to load notification settings."}</p>
        ) : null}
        <CustomerEmailSettings initialSettings={customerEmailSettings} />
      </SettingsLayout>
    </PageShell>
  );
}

function CustomerEmailSettings({ initialSettings }) {
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [settings, setSettings] = useState(() => normalizeCustomerEmailSettings(initialSettings));
  const [activeSignal, setActiveSignal] = useState(CUSTOMER_EMAIL_SIGNALS[0][0]);
  const [testRecipient, setTestRecipient] = useState("");
  const [testSubject, setTestSubject] = useState(() => settings.templates[CUSTOMER_EMAIL_SIGNALS[0][0]]?.subject ?? "");
  const [testBody, setTestBody] = useState(() => settings.templates[CUSTOMER_EMAIL_SIGNALS[0][0]]?.body ?? "");
  const [lastSyncedTestSignal, setLastSyncedTestSignal] = useState(CUSTOMER_EMAIL_SIGNALS[0][0]);
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [logoUploadStatus, setLogoUploadStatus] = useState({ kind: "idle", message: "", progress: 0 });
  const [templateExampleOpen, setTemplateExampleOpen] = useState(false);
  const [templateExampleMode, setTemplateExampleMode] = useState("preview");
  const [brandingDraft, setBrandingDraft] = useState(() => ({ ...settings.branding }));
  const [templateEditorSignal, setTemplateEditorSignal] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ body: "", enabled: true, subject: "" });
  const [templateDraftUnsupported, setTemplateDraftUnsupported] = useState({ body: false, subject: false });
  const [savingTemplateSignal, setSavingTemplateSignal] = useState(null);
  const intent = fetcher.formData?.get("_intent");
  const busy = fetcher.state !== "idle";
  const activeTemplate = settings.templates[activeSignal] ?? { body: "", subject: "" };
  const templateEditorLabel = CUSTOMER_EMAIL_SIGNALS.find(([signal]) => signal === templateEditorSignal)?.[1] ?? "Template";
  const branding = settings.branding;
  const errors = fetcher.data?.errors ?? [];
  const globalSaveBusy = busy && intent === "saveCustomerEmailGlobal";
  const templateSaveBusy = busy && intent === "saveCustomerEmailTemplate";
  const templateDraftHasUnsupported = templateDraftUnsupported.body || templateDraftUnsupported.subject;
  const testBusy = busy && intent === "testCustomerEmail";

  useEffect(() => {
    if (!fetcher.data?.customerEmailSettings || errors.length > 0) return;
    setSettings(normalizeCustomerEmailSettings(fetcher.data.customerEmailSettings));
  }, [errors.length, fetcher.data?.customerEmailSettings]);

  useEffect(() => {
    if (
      fetcher.state !== "idle"
      || intent !== "saveCustomerEmailGlobal"
      || errors.length > 0
      || !fetcher.data
    ) {
      return;
    }

    setSettings((current) => {
      if (fetcher.data.customerEmailSettings) {
        return normalizeCustomerEmailSettings(fetcher.data.customerEmailSettings);
      }

      return {
        ...current,
        globalVersion: fetcher.data.globalVersion ?? current.globalVersion,
      };
    });
  }, [errors.length, fetcher.data, fetcher.state, intent]);

  useEffect(() => {
    if (
      fetcher.state !== "idle"
      || intent !== "saveCustomerEmailTemplate"
      || errors.length > 0
      || (!fetcher.data?.customerEmailSettings && !fetcher.data?.customerEmailTemplate)
    ) {
      return;
    }

    setTemplateEditorSignal(null);
    setSavingTemplateSignal(null);
  }, [errors.length, fetcher.data?.customerEmailSettings, fetcher.data?.customerEmailTemplate, fetcher.state, intent]);

  useEffect(() => {
    if (
      fetcher.state !== "idle"
      || intent !== "saveCustomerEmailTemplate"
      || errors.length > 0
      || !fetcher.data?.customerEmailTemplate
      || !savingTemplateSignal
    ) {
      return;
    }

    setSettings((current) => ({
      ...current,
      templates: {
        ...current.templates,
        [savingTemplateSignal]: {
          ...current.templates[savingTemplateSignal],
          ...fetcher.data.customerEmailTemplate,
          version: fetcher.data.templateVersion
            ?? fetcher.data.customerEmailTemplate.version
            ?? current.templates[savingTemplateSignal]?.version
            ?? null,
        },
      },
    }));
  }, [errors.length, fetcher.data?.customerEmailTemplate, fetcher.data?.templateVersion, fetcher.state, intent, savingTemplateSignal]);

  useEffect(() => {
    if (lastSyncedTestSignal === activeSignal) return;
    setTestSubject(activeTemplate.subject);
    setTestBody(activeTemplate.body);
    setLastSyncedTestSignal(activeSignal);
  }, [activeSignal, activeTemplate.body, activeTemplate.subject, lastSyncedTestSignal]);

  const submit = async (nextIntent) => {
    const formData = new FormData();
    formData.set("_intent", nextIntent);
    formData.set("shopifySessionToken", await shopify.idToken());
    if (nextIntent === "testCustomerEmail") {
      const attemptId = crypto.randomUUID();
      console.info("customer_email.test.button.clicked", {
        attemptId,
        recipientDomain: emailDomain(testRecipient),
        signal: activeSignal,
      });
      formData.set("attemptId", attemptId);
      formData.set("body", testBody);
      formData.set("confirmed", String(testConfirmed));
      formData.set("recipientEmail", testRecipient);
      formData.set("signal", activeSignal);
      formData.set("subject", testSubject);
    } else if (nextIntent === "saveCustomerEmailGlobal") {
      formData.set("expectedVersion", settings.globalVersion ?? "");
      formData.set("senderName", settings.senderName);
      formData.set("senderEmail", settings.senderEmail);
      formData.set("replyTo", settings.replyTo);
      for (const field of ["logoUrl", "logoMode", "logoWidth", "logoLinkUrl"]) {
        formData.set(`branding.${field}`, String(branding[field] ?? ""));
      }
      for (const field of ["businessName", "address", "phone", "contactEmail", "websiteUrl", "note"]) {
        formData.set(`branding.${field}`, String(branding[field] ?? ""));
      }
    }
    fetcher.submit(formData, { method: "post" });
  };

  const openTemplateExample = () => {
    setBrandingDraft({ ...branding });
    setLogoUploadStatus({ kind: "idle", message: "", progress: 0 });
    setTemplateExampleMode("preview");
    setTemplateExampleOpen(true);
  };

  const applyBrandingDraft = () => {
    setSettings((current) => ({ ...current, branding: { ...brandingDraft } }));
    setTemplateExampleMode("preview");
  };

  const openTemplateEditor = (signal) => {
    const template = settings.templates[signal] ?? { body: "", enabled: true, subject: "" };
    setActiveSignal(signal);
    setTemplateDraft({ body: template.body, enabled: template.enabled ?? true, subject: template.subject });
    setTemplateDraftUnsupported({
      body: hasUnsupportedTemplateSegments(parseTemplateDocument(template.body)),
      subject: hasUnsupportedTemplateSegments(parseTemplateDocument(template.subject)),
    });
    setSavingTemplateSignal(null);
    setTemplateEditorSignal(signal);
  };

  const setTemplateDraftSubjectUnsupported = useCallback((hasUnsupported) => {
    setTemplateDraftUnsupported((current) => (
      current.subject === hasUnsupported ? current : { ...current, subject: hasUnsupported }
    ));
  }, []);

  const setTemplateDraftBodyUnsupported = useCallback((hasUnsupported) => {
    setTemplateDraftUnsupported((current) => (
      current.body === hasUnsupported ? current : { ...current, body: hasUnsupported }
    ));
  }, []);

  const saveTemplateDraft = async () => {
    if (!templateEditorSignal) return;
    const formData = new FormData();
    formData.set("_intent", "saveCustomerEmailTemplate");
    formData.set("shopifySessionToken", await shopify.idToken());
    formData.set("body", templateDraft.body);
    formData.set("enabled", String(templateDraft.enabled));
    formData.set("expectedVersion", settings.templates[templateEditorSignal]?.version ?? "");
    formData.set("subject", templateDraft.subject);
    formData.set("templateSignal", templateEditorSignal);
    setSavingTemplateSignal(templateEditorSignal);
    fetcher.submit(formData, { method: "post" });
  };

  const handleLogoUpload = async (event) => {
    const logo = event.target.files?.[0] ?? null;
    if (!logo) return;

    if (!CUSTOMER_EMAIL_LOGO_ACCEPTED_TYPES.has(logo.type)) {
      setLogoUploadStatus({ kind: "error", message: "Choose a PNG, JPEG, or WebP image.", progress: 0 });
      event.target.value = "";
      return;
    }

    if (logo.size > CUSTOMER_EMAIL_LOGO_MAX_BYTES) {
      setLogoUploadStatus({ kind: "error", message: "Logo must be 1 MiB or smaller.", progress: 0 });
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.set("_intent", "uploadCustomerEmailLogo");
    formData.set("shopifySessionToken", await shopify.idToken());
    formData.set("logo", logo);
    setLogoUploadStatus({ kind: "uploading", message: "Uploading logo...", progress: 0 });

    try {
      const result = await uploadLogoWithProgress(formData, (progress) => {
        setLogoUploadStatus({ kind: "uploading", message: "Uploading logo...", progress });
      });
      const uploadError = result.errors?.[0];
      const logoUrl = result.logoAsset?.url;
      if (uploadError || !logoUrl) {
        throw new Error(uploadError?.message ?? "Logo upload did not return a URL.");
      }

      setBrandingDraft((current) => ({ ...current, logoMode: "image", logoUrl }));
      setLogoUploadStatus({ kind: "success", message: "Logo uploaded. Apply changes, then save notification settings.", progress: 100 });
    } catch (error) {
      setLogoUploadStatus({ kind: "error", message: error?.message ?? "Unable to upload logo.", progress: 0 });
    } finally {
      event.target.value = "";
    }
  };

  return (
    <div style={settingsFormStyle}>
      <fieldset style={settingsFieldsetStyle}>
        <legend style={settingsLegendStyle}>Customer Notifications</legend>
        <p style={settingsMessageStyle}>Messages are sent manually from a child route. Saving a template never queues or sends email.</p>
      </fieldset>

      <section aria-label="Notification sender" style={settingsSectionCardStyle}>
        <strong>Sender</strong>
        <div style={settingsCoordinateGridStyle}>
          <label style={settingsLabelStyle}>Sender name<input onChange={(event) => setSettings({ ...settings, senderName: event.target.value })} style={settingsInputStyle} value={settings.senderName} /></label>
          <label style={settingsLabelStyle}>Sender email<input onChange={(event) => setSettings({ ...settings, senderEmail: event.target.value })} style={settingsInputStyle} type="email" value={settings.senderEmail} /></label>
        </div>
        <label style={settingsLabelStyle}>Reply-to email<input onChange={(event) => setSettings({ ...settings, replyTo: event.target.value })} style={settingsInputStyle} type="email" value={settings.replyTo} /></label>
      </section>

      <section aria-label="Notification branding" style={settingsSectionCardStyle}>
        <div style={notificationCardHeaderStyle}>
          <div>
            <strong>Branding</strong>
            <p style={settingsMessageStyle}>Open an example to preview the email or edit its logo and footer branding.</p>
          </div>
          <button onClick={openTemplateExample} style={settingsResetButtonStyle} type="button">Template example</button>
        </div>
      </section>

      <section aria-label="Email templates" style={settingsSectionCardStyle}>
        <div style={notificationCardHeaderStyle}>
          <div>
            <strong>Templates</strong>
            <p style={settingsMessageStyle}>Open a template to edit its wording and insert supported variables.</p>
          </div>
        </div>
        <div aria-label="Email templates" style={notificationTemplateListStyle}>
          {CUSTOMER_EMAIL_SIGNALS.map(([signal, label]) => (
            <button
              aria-label={`Edit ${label} template`}
              key={signal}
              onClick={() => openTemplateEditor(signal)}
              style={notificationTemplateRowStyle}
              type="button"
            >
              <span style={notificationTemplateCopyStyle}>
                <strong>{label}</strong>
                <span style={settingsMessageStyle}>{settings.templates[signal]?.subject || "No subject"}</span>
              </span>
              <span style={settings.templates[signal]?.enabled === false ? notificationTemplateDisabledStatusStyle : notificationTemplateEnabledStatusStyle}>
                {settings.templates[signal]?.enabled === false ? "Disabled" : "Enabled"}
              </span>
              <span style={notificationTemplateEditLabelStyle}>Edit</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Send a test notification" style={settingsSectionCardStyle}>
        <strong>Send a test</strong>
        <p style={settingsMessageStyle}>A test goes only to the address entered below. It does not use customer data.</p>
        <input aria-label="Test recipient email" onChange={(event) => setTestRecipient(event.target.value)} placeholder="name@example.com" style={settingsInputStyle} type="email" value={testRecipient} />
        <TemplateTokenEditor
          compact
          id="test-customer-email-subject"
          label="Test subject"
          maxLength={200}
          onChange={setTestSubject}
          value={testSubject}
        />
        <TemplateTokenEditor
          id="test-customer-email-body"
          label="Test body"
          maxLength={10000}
          onChange={setTestBody}
          value={testBody}
        />
        <label style={{ ...settingsLabelStyle, alignItems: "center", display: "flex", gridTemplateColumns: "auto 1fr" }}>
          <input checked={testConfirmed} onChange={(event) => setTestConfirmed(event.target.checked)} type="checkbox" />
          Confirm one test email to this address
        </label>
        <div style={settingsActionRowStyle}>
          <span>{intent === "testCustomerEmail" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Test email accepted{fetcher.data.attemptId ? ` Ref ${fetcher.data.attemptId.slice(0, 8)}` : ""}</span> : null}</span>
          <button disabled={busy || !testConfirmed || !testRecipient} onClick={() => submit("testCustomerEmail")} style={busy || !testConfirmed || !testRecipient ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{testBusy ? "Sending..." : "Send test"}</button>
        </div>
      </section>

      <div style={settingsActionRowStyle}>
        <span>{intent === "saveCustomerEmailGlobal" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Email sender and footer saved</span> : null}</span>
        <button disabled={busy} onClick={() => submit("saveCustomerEmailGlobal")} style={busy ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{globalSaveBusy ? "Saving..." : "Save sender and footer"}</button>
      </div>

      {errors.length > 0 ? <p role="alert" style={settingsErrorStyle}>{errors[0]?.message ?? "Unable to save email settings."}</p> : null}

      {templateExampleOpen ? (
        <SettingsEditorModal ariaLabel="Template example" onClose={() => setTemplateExampleOpen(false)} title="Template example">
          <div aria-label="Template example mode" role="tablist" style={settingsTemplateTabsStyle}>
            <button aria-selected={templateExampleMode === "preview"} onClick={() => setTemplateExampleMode("preview")} role="tab" style={templateExampleMode === "preview" ? settingsButtonStyle : settingsResetButtonStyle} type="button">Preview</button>
            <button aria-selected={templateExampleMode === "edit"} onClick={() => setTemplateExampleMode("edit")} role="tab" style={templateExampleMode === "edit" ? settingsButtonStyle : settingsResetButtonStyle} type="button">Edit</button>
          </div>
          {templateExampleMode === "preview" ? (
            <NotificationPreview activeTemplate={activeTemplate} branding={branding} senderName={settings.senderName} />
          ) : null}
          {templateExampleMode === "edit" ? (
            <div aria-label="Branding controls">
              <div aria-label="Logo settings" style={logoSettingsBlockStyle}>
                <label style={settingsLabelStyle}>
                  Logo upload
                  <input accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} style={settingsInputStyle} type="file" />
                </label>
                {logoUploadStatus.kind !== "idle" ? (
                  <div aria-live="polite" style={logoUploadStatus.kind === "error" ? settingsErrorStyle : settingsMessageStyle}>
                    <span>{logoUploadStatus.message}</span>
                    {logoUploadStatus.kind === "uploading" ? (
                      <progress aria-label="Logo upload progress" max="100" style={{ width: "100%" }} value={logoUploadStatus.progress} />
                    ) : null}
                  </div>
                ) : null}
                <label style={settingsLabelStyle}>Logo URL<input onChange={(event) => setBrandingDraft((current) => ({ ...current, logoUrl: event.target.value }))} placeholder="https://cdn.cleversystem.ai/logo.png" style={settingsInputStyle} type="url" value={brandingDraft.logoUrl} /></label>
                <label style={settingsLabelStyle}>Logo link<input onChange={(event) => setBrandingDraft((current) => ({ ...current, logoLinkUrl: event.target.value }))} placeholder="https://store.cleversystem.ai" style={settingsInputStyle} type="url" value={brandingDraft.logoLinkUrl} /></label>
                <div style={settingsCoordinateGridStyle}>
                  <label style={settingsLabelStyle}>Logo mode<select onChange={(event) => setBrandingDraft((current) => ({ ...current, logoMode: event.target.value }))} style={settingsSelectStyle} value={brandingDraft.logoMode}><option value="hidden">Hidden</option><option value="image">Image</option></select></label>
                  <label style={settingsLabelStyle}>Logo width<input max="320" min="48" onChange={(event) => setBrandingDraft((current) => ({ ...current, logoWidth: Number(event.target.value) }))} style={settingsInputStyle} type="number" value={brandingDraft.logoWidth} /></label>
                </div>
                <div aria-label="Common footer" style={logoSettingsBlockStyle}>
                  <label style={settingsLabelStyle}>Business name<input onChange={(event) => setBrandingDraft((current) => ({ ...current, businessName: event.target.value }))} style={settingsInputStyle} value={brandingDraft.businessName} /></label>
                  <label style={settingsLabelStyle}>Address<textarea onChange={(event) => setBrandingDraft((current) => ({ ...current, address: event.target.value }))} style={{ ...settingsTextareaStyle, minHeight: "72px" }} value={brandingDraft.address} /></label>
                  <div style={settingsCoordinateGridStyle}>
                    <label style={settingsLabelStyle}>Phone<input onChange={(event) => setBrandingDraft((current) => ({ ...current, phone: event.target.value }))} style={settingsInputStyle} type="tel" value={brandingDraft.phone} /></label>
                    <label style={settingsLabelStyle}>Contact email<input onChange={(event) => setBrandingDraft((current) => ({ ...current, contactEmail: event.target.value }))} style={settingsInputStyle} type="email" value={brandingDraft.contactEmail} /></label>
                  </div>
                  <label style={settingsLabelStyle}>Website<input onChange={(event) => setBrandingDraft((current) => ({ ...current, websiteUrl: event.target.value }))} placeholder="https://store.cleversystem.ai" style={settingsInputStyle} type="url" value={brandingDraft.websiteUrl} /></label>
                  <label style={settingsLabelStyle}>Note<textarea onChange={(event) => setBrandingDraft((current) => ({ ...current, note: event.target.value }))} style={{ ...settingsTextareaStyle, minHeight: "92px" }} value={brandingDraft.note} /></label>
                </div>
              </div>
            </div>
          ) : null}
          <div style={settingsActionRowStyle}>
            <button onClick={() => setTemplateExampleOpen(false)} style={settingsResetButtonStyle} type="button">Close</button>
            {templateExampleMode === "edit" ? <button onClick={applyBrandingDraft} style={settingsButtonStyle} type="button">Apply changes</button> : null}
          </div>
        </SettingsEditorModal>
      ) : null}

      {templateEditorSignal ? (
        <SettingsEditorModal ariaLabel={`Edit ${templateEditorLabel} template`} onClose={() => setTemplateEditorSignal(null)} title={templateEditorLabel}>
          <TemplateTokenEditor
            compact
            id={`template-${templateEditorSignal}-subject`}
            label="Subject"
            maxLength={200}
            onChange={(subject) => setTemplateDraft((current) => ({ ...current, subject }))}
            onUnsupportedChange={setTemplateDraftSubjectUnsupported}
            value={templateDraft.subject}
          />
          <label style={{ ...settingsLabelStyle, alignItems: "center", display: "flex", gridTemplateColumns: "auto 1fr" }}>
            <input checked={templateDraft.enabled} onChange={(event) => setTemplateDraft((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
            Enabled
          </label>
          <TemplateTokenEditor
            id={`template-${templateEditorSignal}-body`}
            label="Body"
            onChange={(body) => setTemplateDraft((current) => ({ ...current, body }))}
            onUnsupportedChange={setTemplateDraftBodyUnsupported}
            value={templateDraft.body}
          />
          <p style={templateDraftHasUnsupported ? settingsErrorStyle : settingsMessageStyle}>Variables are shown as chips. Unsupported pasted variables must be removed before this template can be saved.</p>
          <div style={settingsActionRowStyle}>
            <button onClick={() => setTemplateEditorSignal(null)} style={settingsResetButtonStyle} type="button">Cancel</button>
            <button
              disabled={busy || templateDraftHasUnsupported}
              onClick={saveTemplateDraft}
              style={busy || templateDraftHasUnsupported ? settingsDisabledButtonStyle : settingsButtonStyle}
              type="button"
            >
              {templateSaveBusy && savingTemplateSignal === templateEditorSignal ? "Saving..." : "Save template"}
            </button>
          </div>
        </SettingsEditorModal>
      ) : null}
    </div>
  );
}

function SettingsEditorModal({ ariaLabel, children, onClose, title }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
      style={notificationModalOverlayStyle}
    >
      <section aria-label={ariaLabel} aria-modal="true" role="dialog" style={notificationModalStyle}>
        <header style={notificationModalHeaderStyle}>
          <strong>{title}</strong>
          <button aria-label="Close editor" onClick={onClose} style={notificationModalCloseStyle} type="button">×</button>
        </header>
        <div style={notificationModalBodyStyle}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}

function uploadLogoWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${window.location.pathname}${window.location.search}`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onload = () => {
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        reject(new Error("Logo upload returned an invalid response."));
        return;
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(payload?.errors?.[0]?.message ?? "Unable to upload logo."));
        return;
      }

      resolve(payload);
    };
    xhr.onerror = () => reject(new Error("Unable to upload logo."));
    xhr.send(formData);
  });
}

function NotificationPreview({ activeTemplate, branding, senderName }) {
  const logo = branding.logoMode === "image" && branding.logoUrl.startsWith("https://");
  const logoWidth = Math.max(48, Math.min(320, Number(branding.logoWidth) || DEFAULT_BRANDING.logoWidth));
  const subject = activeTemplate.subject || "Delivery scheduled";
  const body = activeTemplate.body || "Hi Mina, your delivery is scheduled.";
  const footerItems = buildCommonFooterItems(branding);
  const hasCommonFooter = logo || footerItems.length > 0;
  const footerLogo = logo ? (
    branding.logoLinkUrl.startsWith("https://") ? (
      <a href={branding.logoLinkUrl} rel="noreferrer" style={{ justifySelf: "start" }} target="_blank">
        <img alt={deriveLogoAltText(senderName)} src={branding.logoUrl} style={notificationPreviewLogoStyle(logoWidth)} />
      </a>
    ) : (
      <img alt={deriveLogoAltText(senderName)} src={branding.logoUrl} style={notificationPreviewLogoStyle(logoWidth)} />
    )
  ) : null;

  return (
    <div aria-label="Live notification preview" className="customer-email-preview" style={notificationPreviewFrameStyle}>
      <style>{NOTIFICATION_PREVIEW_COLOR_SCHEME_CSS}</style>
      <article className="customer-email-preview__surface" style={notificationPreviewSurfaceStyle}>
        <h2 style={notificationPreviewTitleStyle}>{subject}</h2>
        <p style={notificationPreviewBodyStyle}>{body}</p>
        {hasCommonFooter ? (
          <>
            <hr aria-hidden="true" style={notificationPreviewDividerStyle} />
            <div className="customer-email-preview__footer" style={notificationPreviewFooterBoxStyle}>
              {footerLogo}
              {footerItems.map((item) => (
                <p className="customer-email-preview__muted" key={item.key} style={item.kind === "note" ? notificationPreviewFooterNoteStyle : notificationPreviewFooterTextStyle}>
                  {item.value}
                </p>
              ))}
            </div>
          </>
        ) : null}
      </article>
    </div>
  );
}

function buildCommonFooterItems(branding) {
  return [
    ["businessName", branding.businessName],
    ["address", branding.address],
    ["phone", branding.phone],
    ["contactEmail", branding.contactEmail],
    ["websiteUrl", branding.websiteUrl],
    ["note", branding.note],
  ].flatMap(([key, value]) => {
    const text = String(value ?? "").trim();
    return text ? [{ key, kind: key === "note" ? "note" : "detail", value: text }] : [];
  });
}

function notificationPreviewLogoStyle(logoWidth) {
  return {
    display: "block",
    height: "auto",
    justifySelf: "start",
    maxHeight: "64px",
    maxWidth: "160px",
    objectFit: "contain",
    width: `${Math.min(logoWidth, 160)}px`,
  };
}

function deriveLogoAltText(senderName) {
  const normalized = String(senderName ?? "").replace(/[<>]/gu, "").replace(/\s+/gu, " ").trim();
  return normalized || "Brand";
}

const logoSettingsBlockStyle = {
  border: "1px solid #d0d7de",
  borderRadius: "8px",
  display: "grid",
  gap: "10px",
  padding: "12px",
};

const notificationCardHeaderStyle = {
  alignItems: "start",
  display: "flex",
  gap: "16px",
  justifyContent: "space-between",
};

const notificationTemplateListStyle = {
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  display: "grid",
  overflow: "hidden",
};

const notificationTemplateRowStyle = {
  alignItems: "center",
  appearance: "none",
  background: "#ffffff",
  border: 0,
  borderBottom: "1px solid #e3e3e3",
  color: "#303030",
  cursor: "pointer",
  display: "flex",
  font: "inherit",
  gap: "16px",
  justifyContent: "space-between",
  minHeight: "56px",
  padding: "10px 12px",
  textAlign: "left",
  width: "100%",
};

const notificationTemplateCopyStyle = {
  display: "grid",
  gap: "3px",
  minWidth: 0,
};

const notificationTemplateEditLabelStyle = {
  color: "#005bd3",
  flex: "0 0 auto",
  fontSize: "13px",
  fontWeight: 650,
};

const notificationTemplateEnabledStatusStyle = {
  color: "#008060",
  flex: "0 0 auto",
  fontSize: "12px",
  fontWeight: 650,
};

const notificationTemplateDisabledStatusStyle = {
  ...notificationTemplateEnabledStatusStyle,
  color: "#8e1f0b",
};

const notificationModalOverlayStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.38)",
  display: "flex",
  inset: 0,
  justifyContent: "center",
  padding: "16px",
  position: "fixed",
  zIndex: 2147483000,
};

const notificationModalStyle = {
  background: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 20px 48px rgba(0, 0, 0, 0.24)",
  boxSizing: "border-box",
  maxHeight: "calc(100vh - 32px)",
  maxWidth: "960px",
  overflow: "hidden",
  width: "100%",
};

const notificationModalHeaderStyle = {
  alignItems: "center",
  borderBottom: "1px solid #e3e3e3",
  display: "flex",
  fontSize: "16px",
  justifyContent: "space-between",
  minHeight: "48px",
  padding: "0 16px",
};

const notificationModalCloseStyle = {
  alignItems: "center",
  appearance: "none",
  background: "transparent",
  border: 0,
  borderRadius: "6px",
  color: "#616161",
  cursor: "pointer",
  display: "inline-flex",
  fontSize: "22px",
  height: "32px",
  justifyContent: "center",
  width: "32px",
};

const notificationModalBodyStyle = {
  display: "grid",
  gap: "14px",
  maxHeight: "calc(100vh - 82px)",
  overflowY: "auto",
  padding: "16px",
};

const NOTIFICATION_PREVIEW_COLOR_SCHEME_CSS = `
@media (prefers-color-scheme: dark) {
  .customer-email-preview {
    background: #161b22;
    border-color: #30363d;
  }

  .customer-email-preview__surface {
    background: #0d1117;
    color: #e6edf3;
  }

  .customer-email-preview__footer {
    background: #161b22 !important;
    border-color: #30363d !important;
  }

  .customer-email-preview__muted {
    color: #c9d1d9 !important;
  }
}
`;

const notificationPreviewFrameStyle = {
  background: "#f3f4f6",
  border: "1px solid #d0d7de",
  borderRadius: "8px",
  display: "grid",
  padding: "16px",
};

const notificationPreviewSurfaceStyle = {
  background: "#ffffff",
  borderRadius: "8px",
  color: "#1f2328",
  display: "grid",
  gap: "16px",
  margin: 0,
  padding: "24px",
};

const notificationPreviewTitleStyle = {
  fontSize: "24px",
  fontWeight: 700,
  lineHeight: "32px",
  margin: 0,
};

const notificationPreviewBodyStyle = {
  fontSize: "14px",
  lineHeight: "22px",
  margin: 0,
  whiteSpace: "pre-wrap",
};

const notificationPreviewDividerStyle = {
  border: 0,
  borderTop: "1px solid #d0d7de",
  margin: 0,
};

const notificationPreviewFooterBoxStyle = {
  background: "#f6f8fa",
  border: "1px solid #d0d7de",
  borderRadius: "8px",
  display: "grid",
  gap: "8px",
  justifyItems: "start",
  padding: "12px",
};

const notificationPreviewFooterTextStyle = {
  color: "#57606a",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
  whiteSpace: "pre-wrap",
};

const notificationPreviewFooterNoteStyle = {
  ...notificationPreviewFooterTextStyle,
  borderTop: "1px solid #d0d7de",
  paddingTop: "8px",
};

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
