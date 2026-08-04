/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  fetchCustomerEmailSettings,
  saveCustomerEmailSettings,
  sendCustomerEmailTest,
  uploadCustomerEmailLogo,
} from "../features/delivery/customer-email.server";
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

const CUSTOMER_EMAIL_TEMPLATE_VARIABLES = [
  ["customerName", "Customer name"],
  ["orderNumber", "Order number"],
  ["deliveryDate", "Delivery date"],
  ["deliveryAddress", "Delivery address"],
  ["eta", "ETA"],
  ["routeName", "Route name"],
  ["sequence", "Stop sequence"],
  ["shopName", "Shop name"],
];

const CUSTOMER_EMAIL_LOGO_ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const CUSTOMER_EMAIL_LOGO_MAX_BYTES = 1024 * 1024;

const DEFAULT_BRANDING = {
  accentColor: "#1f6feb",
  backgroundColor: "#f6f8fa",
  footerText: "",
  logoAltText: "CLEVER",
  logoLinkUrl: "",
  logoMode: "hidden",
  logoUrl: "",
  logoWidth: 160,
  previewText: "",
  showPoweredByClever: true,
  surfaceColor: "#ffffff",
  textColor: "#24292f",
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

  if (formData.get("_intent") === "saveCustomerEmailSettings") {
    return saveCustomerEmailSettings(request, readCustomerEmailSettings(formData), {
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

function readCustomerEmailSettings(formData) {
  return {
    branding: {
      accentColor: formText(formData.get("branding.accentColor")),
      backgroundColor: formText(formData.get("branding.backgroundColor")),
      footerText: formText(formData.get("branding.footerText")),
      logoAltText: formText(formData.get("branding.logoAltText")),
      logoLinkUrl: formHttpsUrl(formData.get("branding.logoLinkUrl")),
      logoMode: formText(formData.get("branding.logoMode")) || DEFAULT_BRANDING.logoMode,
      logoUrl: formHttpsUrl(formData.get("branding.logoUrl")),
      logoWidth: numberFromFormValue(formData.get("branding.logoWidth")) ?? DEFAULT_BRANDING.logoWidth,
      previewText: formText(formData.get("branding.previewText")),
      showPoweredByClever: formData.get("branding.showPoweredByClever") === "true",
      surfaceColor: formText(formData.get("branding.surfaceColor")),
      textColor: formText(formData.get("branding.textColor")),
    },
    nearbyStopsThreshold: numberFromFormValue(formData.get("nearbyStopsThreshold")) ?? 3,
    replyTo: formText(formData.get("replyTo")),
    senderEmail: formText(formData.get("senderEmail")),
    senderName: formText(formData.get("senderName")),
    templates: Object.fromEntries(CUSTOMER_EMAIL_SIGNALS.map(([signal]) => [signal, {
      body: formText(formData.get(`template.${signal}.body`)),
      enabled: true,
      subject: formText(formData.get(`template.${signal}.subject`)),
    }])),
    version: 2,
  };
}

function normalizeCustomerEmailSettings(settings) {
  const templates = settings?.templates ?? {};
  const branding = settings?.branding ?? {};
  const sender = settings?.sender ?? {};

  return {
    branding: {
      accentColor: branding.accentColor ?? DEFAULT_BRANDING.accentColor,
      backgroundColor: branding.backgroundColor ?? DEFAULT_BRANDING.backgroundColor,
      footerText: branding.footerText ?? DEFAULT_BRANDING.footerText,
      logoAltText: branding.logoAltText ?? DEFAULT_BRANDING.logoAltText,
      logoLinkUrl: branding.logoLinkUrl ?? "",
      logoMode: branding.logoMode ?? DEFAULT_BRANDING.logoMode,
      logoUrl: branding.logoUrl ?? "",
      logoWidth: branding.logoWidth ?? DEFAULT_BRANDING.logoWidth,
      previewText: branding.previewText ?? DEFAULT_BRANDING.previewText,
      showPoweredByClever: branding.showPoweredByClever ?? DEFAULT_BRANDING.showPoweredByClever,
      surfaceColor: branding.surfaceColor ?? DEFAULT_BRANDING.surfaceColor,
      textColor: branding.textColor ?? DEFAULT_BRANDING.textColor,
    },
    nearbyStopsThreshold: settings?.nearbyStopsThreshold ?? 3,
    replyTo: settings?.replyTo ?? "",
    senderEmail: settings?.senderEmail ?? sender.email ?? "",
    senderName: settings?.senderName ?? sender.name ?? "",
    templates: Object.fromEntries(CUSTOMER_EMAIL_SIGNALS.map(([signal]) => [signal, {
      body: templates?.[signal]?.body ?? "",
      enabled: templates?.[signal]?.enabled ?? true,
      subject: templates?.[signal]?.subject ?? "",
    }])),
  };
}

function formText(value) {
  if (value == null) return "";

  return String(value).trim();
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
  const [templateDraft, setTemplateDraft] = useState({ body: "", subject: "" });
  const templateBodyRef = useRef(null);
  const intent = fetcher.formData?.get("_intent");
  const busy = fetcher.state !== "idle";
  const activeTemplate = settings.templates[activeSignal] ?? { body: "", subject: "" };
  const templateEditorLabel = CUSTOMER_EMAIL_SIGNALS.find(([signal]) => signal === templateEditorSignal)?.[1] ?? "Template";
  const branding = settings.branding;
  const errors = fetcher.data?.errors ?? [];
  const saveBusy = busy && intent === "saveCustomerEmailSettings";
  const testBusy = busy && intent === "testCustomerEmail";

  useEffect(() => {
    if (!fetcher.data?.customerEmailSettings || errors.length > 0) return;
    setSettings(normalizeCustomerEmailSettings(fetcher.data.customerEmailSettings));
  }, [errors.length, fetcher.data?.customerEmailSettings]);

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
    } else {
      formData.set("senderName", settings.senderName);
      formData.set("senderEmail", settings.senderEmail);
      formData.set("replyTo", settings.replyTo);
      formData.set("nearbyStopsThreshold", String(settings.nearbyStopsThreshold));
      for (const field of ["accentColor", "backgroundColor", "surfaceColor", "textColor"]) {
        formData.set(`branding.${field}`, branding[field]);
      }
      for (const field of ["logoUrl", "logoMode", "logoWidth", "logoLinkUrl", "logoAltText", "previewText", "footerText"]) {
        formData.set(`branding.${field}`, String(branding[field] ?? ""));
      }
      formData.set("branding.showPoweredByClever", String(branding.showPoweredByClever));
      for (const [signal, template] of Object.entries(settings.templates)) {
        formData.set(`template.${signal}.subject`, template.subject);
        formData.set(`template.${signal}.body`, template.body);
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
    const template = settings.templates[signal] ?? { body: "", subject: "" };
    setActiveSignal(signal);
    setTemplateDraft({ body: template.body, subject: template.subject });
    setTemplateEditorSignal(signal);
  };

  const applyTemplateDraft = () => {
    if (!templateEditorSignal) return;
    setSettings((current) => ({
      ...current,
      templates: {
        ...current.templates,
        [templateEditorSignal]: { ...current.templates[templateEditorSignal], ...templateDraft },
      },
    }));
    setTemplateEditorSignal(null);
  };

  const insertTemplateVariable = (variable) => {
    const token = `{{${variable}}}`;
    const textarea = templateBodyRef.current;
    const start = textarea?.selectionStart ?? templateDraft.body.length;
    const end = textarea?.selectionEnd ?? start;
    const body = `${templateDraft.body.slice(0, start)}${token}${templateDraft.body.slice(end)}`;
    setTemplateDraft((current) => ({ ...current, body }));
    window.requestAnimationFrame(() => {
      const cursor = start + token.length;
      templateBodyRef.current?.focus();
      templateBodyRef.current?.setSelectionRange(cursor, cursor);
    });
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
        <div style={settingsCoordinateGridStyle}>
          <label style={settingsLabelStyle}>Reply-to email<input onChange={(event) => setSettings({ ...settings, replyTo: event.target.value })} style={settingsInputStyle} type="email" value={settings.replyTo} /></label>
          <label style={settingsLabelStyle}>Nearby trigger stops<input max="25" min="1" onChange={(event) => setSettings({ ...settings, nearbyStopsThreshold: event.target.value })} style={settingsInputStyle} type="number" value={settings.nearbyStopsThreshold} /></label>
        </div>
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
              <span style={notificationTemplateEditLabelStyle}>Edit</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Send a test notification" style={settingsSectionCardStyle}>
        <strong>Send a test</strong>
        <p style={settingsMessageStyle}>A test goes only to the address entered below. It does not use customer data.</p>
        <input aria-label="Test recipient email" onChange={(event) => setTestRecipient(event.target.value)} placeholder="name@example.com" style={settingsInputStyle} type="email" value={testRecipient} />
        <label style={settingsLabelStyle}>Subject<input aria-label="Test subject" maxLength={200} onChange={(event) => setTestSubject(event.target.value)} style={settingsInputStyle} value={testSubject} /></label>
        <label style={settingsLabelStyle}>Body<textarea aria-label="Test body" maxLength={10000} onChange={(event) => setTestBody(event.target.value)} style={settingsTextareaStyle} value={testBody} /></label>
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
        <span>{intent === "saveCustomerEmailSettings" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Email settings saved</span> : null}</span>
        <button disabled={busy} onClick={() => submit("saveCustomerEmailSettings")} style={busy ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{saveBusy ? "Saving..." : "Save notification settings"}</button>
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
                <label style={settingsLabelStyle}>Footer text<textarea onChange={(event) => setBrandingDraft((current) => ({ ...current, footerText: event.target.value }))} style={{ ...settingsTextareaStyle, minHeight: "92px" }} value={brandingDraft.footerText} /></label>
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
          <label style={settingsLabelStyle}>Subject<input maxLength={200} onChange={(event) => setTemplateDraft((current) => ({ ...current, subject: event.target.value }))} style={settingsInputStyle} value={templateDraft.subject} /></label>
          <label style={settingsLabelStyle}>Body<textarea maxLength={10000} onChange={(event) => setTemplateDraft((current) => ({ ...current, body: event.target.value }))} ref={templateBodyRef} style={settingsTextareaStyle} value={templateDraft.body} /></label>
          <div>
            <strong style={notificationVariablesTitleStyle}>Insert variable</strong>
            <div aria-label="Template variables" style={settingsTemplateTabsStyle}>
              {CUSTOMER_EMAIL_TEMPLATE_VARIABLES.map(([variable, label]) => (
                <button key={variable} onClick={() => insertTemplateVariable(variable)} style={notificationVariableButtonStyle} type="button">{label}</button>
              ))}
            </div>
          </div>
          <p style={settingsMessageStyle}>Variables are rendered by the delivery server. Unknown variables are rejected before sending.</p>
          <div style={settingsActionRowStyle}>
            <button onClick={() => setTemplateEditorSignal(null)} style={settingsResetButtonStyle} type="button">Cancel</button>
            <button onClick={applyTemplateDraft} style={settingsButtonStyle} type="button">Apply template</button>
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
  const body = activeTemplate.body || "Hi {{ customer.firstName }}, your delivery is scheduled.";
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
        <hr aria-hidden="true" style={notificationPreviewDividerStyle} />
        <div className="customer-email-preview__footer" style={notificationPreviewFooterBoxStyle}>
          {footerLogo}
          <p className="customer-email-preview__muted" style={notificationPreviewFooterTextStyle}>{branding.footerText}</p>
        </div>
      </article>
    </div>
  );
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

const notificationVariablesTitleStyle = {
  display: "block",
  fontSize: "13px",
  marginBottom: "8px",
};

const notificationVariableButtonStyle = {
  ...settingsResetButtonStyle,
  fontWeight: 550,
  minHeight: "30px",
  padding: "4px 8px",
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

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
