/* eslint-disable react/prop-types */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFetcher, useLoaderData, useRouteLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AdminRouteErrorBoundary } from "../ui/admin-route-error-boundary";
import {
  activateCustomerNotifications,
  deactivateCustomerNotifications,
  fetchCustomerEmailSettings,
  getCustomerEmailTestConfirmationError,
  saveCustomerEmailGlobal,
  saveCustomerEmailTemplate,
  sendCustomerEmailTest,
} from "../features/customer-notifications/customer-email.server";
import {
  CustomerEmailAutomaticSwitch,
  CustomerEmailSenderSettings,
  CustomerEmailTestSendPanel,
  ToggleSwitch,
} from "../features/customer-notifications/customer-email-components";
import { CustomerEmailPreviewFrame } from "../features/customer-notifications/customer-email-preview-frame";
import {
  ETA_WINDOW_DIRECTIONS,
  formatPreviewEtaWindow,
  normalizeEtaWindow,
  readEtaWindowFormValues,
} from "../features/customer-notifications/eta-window";
import { translate } from "../i18n/i18n";
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
const CUSTOMER_EMAIL_LOGO_MAX_BYTES = 3 * 1024 * 1024;
const CUSTOMER_EMAIL_LOGO_UPLOAD_PATH = "/app/settings/notifications/logo";
const CUSTOMER_EMAIL_PREVIEW_PATH = "/app/settings/notifications/preview";

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

  // The shop-wide automatic switch. Route options posts here too.
  if (formData.get("_intent") === "activateCustomerEmailAutomatic") {
    return activateCustomerNotifications(request, { confirmed: true }, {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
  }

  if (formData.get("_intent") === "deactivateCustomerEmailAutomatic") {
    return deactivateCustomerNotifications(request, { confirmed: true }, {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
  }

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

  if (formData.get("_intent") === "testCustomerEmail") {
    const attemptId = formText(formData.get("attemptId")) || crypto.randomUUID();
    const recipientEmail = formText(formData.get("recipientEmail"));
    const signal = formText(formData.get("signal"));
    const input = {
      attemptId,
      body: formText(formData.get("body")),
      branding: parseOptionalJsonObject(formData.get("branding")),
      confirmed: formData.get("confirmed") === "true",
      etaWindow: parseOptionalJsonObject(formData.get("etaWindow")),
      recipientEmail,
      senderName: formText(formData.get("senderName")),
      signal,
      subject: formText(formData.get("subject")),
      template: parseOptionalJsonObject(formData.get("template")),
    };
    const confirmationError = getCustomerEmailTestConfirmationError(input);
    if (confirmationError) return { attemptId, errors: [confirmationError], test: null };
    const result = await sendCustomerEmailTest(request, input, {
      sessionToken: formText(formData.get("shopifySessionToken")),
    });
    return result;
  }

  return { errors: [{ message: "Unknown notification settings action." }] };
};

function readCustomerEmailGlobalSettings(formData) {
  return {
    expectedVersion: numberFromFormValue(formData.get("expectedVersion")),
    etaWindow: readEtaWindowFormValues(formData.get("etaWindow.direction"), formData.get("etaWindow.minutes")),
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
      expectedVersion: numberFromFormValue(formData.get("expectedVersion")),
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
    etaWindow: normalizeEtaWindow(settings?.etaWindow),
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

function parseOptionalJsonObject(value) {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
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

export default function CustomerNotificationsSettingsPage() {
  const { customerEmailSettings, errors: loaderErrors } = useLoaderData();

  return (
    <PageShell title="Settings">
      <SettingsLayout>
        {loaderErrors?.length > 0 ? (
          <p role="alert" style={settingsErrorStyle}>{loaderErrors[0]?.message ?? "Unable to load notification settings."}</p>
        ) : null}
        <CustomerEmailSettings
          automaticEnabled={customerEmailSettings ? customerEmailSettings.automatic?.enabled === true : null}
          initialSettings={customerEmailSettings}
        />
      </SettingsLayout>
    </PageShell>
  );
}

function CustomerEmailSettings({ automaticEnabled, initialSettings }) {
  const language = useRouteLoaderData("routes/app")?.language ?? "en";
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const [settings, setSettings] = useState(() => normalizeCustomerEmailSettings(initialSettings));
  const [activeSignal, setActiveSignal] = useState(CUSTOMER_EMAIL_SIGNALS[0][0]);
  const [testRecipient, setTestRecipient] = useState("");
  const [testConfirmed, setTestConfirmed] = useState(false);
  const [logoUploadStatus, setLogoUploadStatus] = useState({ kind: "idle", message: "", progress: 0 });
  const [templateExampleOpen, setTemplateExampleOpen] = useState(false);
  const [brandingDraft, setBrandingDraft] = useState(() => ({ ...settings.branding }));
  const [templateEditorSignal, setTemplateEditorSignal] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ body: "", enabled: true, subject: "" });
  const [templateDraftUnsupported, setTemplateDraftUnsupported] = useState({ body: false, subject: false });
  const [savingTemplateSignal, setSavingTemplateSignal] = useState(null);
  // fetcher.formData is gone once the request ends, so the post-save effects read the last submitted intent.
  const [lastIntent, setLastIntent] = useState(null);
  const intent = fetcher.formData?.get("_intent") ?? lastIntent;
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

  const submit = async (nextIntent) => {
    const formData = new FormData();
    formData.set("_intent", nextIntent);
    formData.set("shopifySessionToken", await shopify.idToken());
    if (nextIntent === "testCustomerEmail") {
      const attemptId = crypto.randomUUID();
      formData.set("attemptId", attemptId);
      formData.set("body", templateDraft.body);
      formData.set("branding", JSON.stringify(branding));
      formData.set("confirmed", String(testConfirmed));
      formData.set("etaWindow", JSON.stringify(settings.etaWindow));
      formData.set("recipientEmail", testRecipient);
      formData.set("senderName", settings.senderName);
      formData.set("signal", templateEditorSignal ?? "");
      formData.set("subject", templateDraft.subject);
      formData.set("template", JSON.stringify({ body: templateDraft.body, subject: templateDraft.subject }));
    } else if (nextIntent === "saveCustomerEmailGlobal") {
      formData.set("expectedVersion", settings.globalVersion ?? "");
      formData.set("senderName", settings.senderName);
      formData.set("senderEmail", settings.senderEmail);
      formData.set("replyTo", settings.replyTo);
      formData.set("etaWindow.direction", settings.etaWindow.direction);
      formData.set("etaWindow.minutes", String(settings.etaWindow.minutes ?? ""));
      for (const field of ["logoUrl", "logoMode", "logoWidth", "logoLinkUrl"]) {
        formData.set(`branding.${field}`, String(branding[field] ?? ""));
      }
      for (const field of ["businessName", "address", "phone", "contactEmail", "websiteUrl", "note"]) {
        formData.set(`branding.${field}`, String(branding[field] ?? ""));
      }
    }
    setLastIntent(formData.get("_intent"));
    fetcher.submit(formData, { method: "post" });
  };

  const openTemplateExample = () => {
    setBrandingDraft({ ...branding });
    setLogoUploadStatus({ kind: "idle", message: "", progress: 0 });
    setTemplateExampleOpen(true);
  };

  const applyBrandingDraft = () => {
    setSettings((current) => ({ ...current, branding: { ...brandingDraft } }));
    setTemplateExampleOpen(false);
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
    setTestConfirmed(false);
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
    setLastIntent(formData.get("_intent"));
    fetcher.submit(formData, { method: "post" });
  };

  // The Status switch in the templates table saves only the enabled flag; subject and body are resent unchanged.
  const toggleTemplateEnabled = async (signal, enabled) => {
    const template = settings.templates[signal];
    if (!template) return;
    const formData = new FormData();
    formData.set("_intent", "saveCustomerEmailTemplate");
    formData.set("shopifySessionToken", await shopify.idToken());
    formData.set("body", template.body ?? "");
    formData.set("enabled", String(enabled));
    formData.set("expectedVersion", template.version ?? "");
    formData.set("subject", template.subject ?? "");
    formData.set("templateSignal", signal);
    setSavingTemplateSignal(signal);
    setLastIntent(formData.get("_intent"));
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
      setLogoUploadStatus({ kind: "error", message: "Logo must be 3 MiB or smaller.", progress: 0 });
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
      <style>{CUSTOMER_NOTIFICATION_RESPONSIVE_CSS}</style>
      <fieldset style={settingsFieldsetStyle}>
        <legend style={settingsLegendStyle}>Customer Notifications</legend>
        <p style={settingsMessageStyle}>Automatic emails include eligible stops added after Dispatch. Delivery scheduled is sent only from the Send notifications menu.</p>
      </fieldset>

      <section aria-label="Automatic customer emails" style={settingsSectionCardStyle}>
        <CustomerEmailAutomaticSwitch enabled={automaticEnabled} />
      </section>

      <CustomerEmailSenderSettings
        onReplyToChange={(replyTo) => setSettings({ ...settings, replyTo })}
        onSenderNameChange={(senderName) => setSettings({ ...settings, senderName })}
        replyTo={settings.replyTo}
        senderName={settings.senderName}
      />

      <section aria-label={translate(language, "notifications.etaWindow.title")} style={settingsSectionCardStyle}>
        <div>
          <strong>{translate(language, "notifications.etaWindow.title")}</strong>
          <p style={settingsMessageStyle}>{translate(language, "notifications.etaWindow.help")}</p>
        </div>
        <div style={settingsCoordinateGridStyle}>
          <div style={settingsLabelStyle}>
            {translate(language, "notifications.etaWindow.direction")}
            <div aria-label={translate(language, "notifications.etaWindow.direction")} role="group" style={etaWindowToggleStyle}>
              {ETA_WINDOW_DIRECTIONS.map((direction) => (
                <button
                  aria-pressed={settings.etaWindow.direction === direction}
                  key={direction}
                  onClick={() => setSettings({ ...settings, etaWindow: { ...settings.etaWindow, direction } })}
                  style={settings.etaWindow.direction === direction ? activeEtaWindowToggleButtonStyle : etaWindowToggleButtonStyle}
                  type="button"
                >{translate(language, `notifications.etaWindow.direction.${direction}`)}</button>
              ))}
            </div>
          </div>
          <label style={settingsLabelStyle}>
            {translate(language, "notifications.etaWindow.minutes")}
            <input
              max={240}
              min={5}
              onChange={(event) => setSettings({ ...settings, etaWindow: { ...settings.etaWindow, minutes: event.target.value === "" ? "" : Number(event.target.value) } })}
              step={1}
              style={settingsInputStyle}
              type="number"
              value={settings.etaWindow.minutes}
            />
          </label>
        </div>
        <p style={settingsMessageStyle}>{translate(language, "notifications.etaWindow.example", { window: formatPreviewEtaWindow(settings.etaWindow) })}</p>
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
            <p style={settingsMessageStyle}>Edit the message, preview the finished email, and send a test from one place.</p>
          </div>
        </div>
        <div className="customer-notification-template-table" style={notificationTemplateTableFrameStyle}>
          <table aria-label="Email templates" style={notificationTemplateTableStyle}>
            <thead>
              <tr style={notificationTemplateHeaderRowStyle}>
                <th scope="col" style={notificationTemplateHeaderCellStyle}>Notification</th>
                <th scope="col" style={notificationTemplateHeaderCellStyle}>Subject</th>
                <th scope="col" style={notificationTemplateStatusHeaderStyle}>Status</th>
                <th aria-label="Actions" scope="col" style={notificationTemplateActionHeaderStyle} />
              </tr>
            </thead>
            <tbody>
              {CUSTOMER_EMAIL_SIGNALS.map(([signal, label]) => (
                <tr key={signal} style={notificationTemplateRowStyle}>
                  <th scope="row" style={notificationTemplateNameCellStyle}>{label}</th>
                  <td style={notificationTemplateSubjectCellStyle}>{settings.templates[signal]?.subject || <span style={notificationTemplateEmptyTextStyle}>No subject</span>}</td>
                  <td style={notificationTemplateStatusCellStyle}>
                    <ToggleSwitch
                      checked={settings.templates[signal]?.enabled !== false}
                      disabled={busy}
                      label={`${label} template enabled`}
                      onChange={(enabled) => toggleTemplateEnabled(signal, enabled)}
                    />
                  </td>
                  <td style={notificationTemplateActionCellStyle}>
                    <button aria-label={`Edit ${label} template`} onClick={() => openTemplateEditor(signal)} style={notificationTemplateEditButtonStyle} type="button">Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div style={settingsActionRowStyle}>
        <span>{intent === "saveCustomerEmailGlobal" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Customer-facing identity and footer saved</span> : null}</span>
        <button disabled={busy} onClick={() => submit("saveCustomerEmailGlobal")} style={busy ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{globalSaveBusy ? "Saving..." : "Save identity and footer"}</button>
      </div>

      {errors.length > 0 ? <p role="alert" style={settingsErrorStyle}>{errors[0]?.message ?? "Unable to save email settings."}</p> : null}

      {templateExampleOpen ? (
        <SettingsEditorModal ariaLabel="Template example" onClose={() => setTemplateExampleOpen(false)} title="Template example">
          <div className="customer-notification-branding-editor" style={notificationBrandingEditorLayoutStyle}>
            <section aria-label="Edit branding" style={notificationBrandingEditorPaneStyle}>
              <div>
                <strong>Edit</strong>
                <p style={settingsMessageStyle}>Changes appear in Preview before saving. Apply them here, then use Save sender and footer.</p>
              </div>
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
                {brandingDraft.logoMode === "image" && brandingDraft.logoUrl.startsWith("https://") ? (
                  <div aria-label="Uploaded logo preview" style={notificationUploadedLogoPreviewStyle}>
                    <img alt={deriveLogoAltText(settings.senderName)} src={brandingDraft.logoUrl} style={notificationPreviewLogoStyle(brandingDraft.logoWidth)} />
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
              <div style={notificationBrandingActionsStyle}>
                <button onClick={() => setTemplateExampleOpen(false)} style={settingsResetButtonStyle} type="button">Close</button>
                <button onClick={applyBrandingDraft} style={settingsButtonStyle} type="button">Apply changes</button>
              </div>
            </section>
            <aside aria-label="Branding preview" style={notificationBrandingPreviewPaneStyle}>
              <div>
                <strong>Preview</strong>
                <p style={settingsMessageStyle}>This is the branding that Apply changes will move into the saved settings form.</p>
              </div>
              <NotificationPreview activeTemplate={activeTemplate} branding={brandingDraft} etaWindow={settings.etaWindow} senderName={settings.senderName} signal={activeSignal} />
            </aside>
          </div>
        </SettingsEditorModal>
      ) : null}

      {templateEditorSignal ? (
        <SettingsEditorModal ariaLabel={`Edit ${templateEditorLabel} template`} onClose={() => setTemplateEditorSignal(null)} title={templateEditorLabel}>
          <div className="customer-notification-template-editor" style={notificationTemplateEditorLayoutStyle}>
            <div style={notificationTemplateComposerStyle}>
              <div style={notificationTemplateEditorIntroStyle}>
                <div>
                  <strong>Message</strong>
                  <p style={settingsMessageStyle}>Type normally. Insert customer and delivery details from the variable menu.</p>
                </div>
                <span style={notificationTemplateEnabledToggleStyle}>
                  Enabled
                  <ToggleSwitch
                    checked={templateDraft.enabled}
                    label={`${templateEditorLabel} template enabled`}
                    onChange={(enabled) => setTemplateDraft((current) => ({ ...current, enabled }))}
                  />
                </span>
              </div>
              <TemplateTokenEditor
                language={language}
                compact
                id={`template-${templateEditorSignal}-subject`}
                label="Subject"
                maxLength={200}
                onChange={(subject) => setTemplateDraft((current) => ({ ...current, subject }))}
                onUnsupportedChange={setTemplateDraftSubjectUnsupported}
                value={templateDraft.subject}
              />
              <TemplateTokenEditor
                language={language}
                id={`template-${templateEditorSignal}-body`}
                label="Body"
                onChange={(body) => setTemplateDraft((current) => ({ ...current, body }))}
                onUnsupportedChange={setTemplateDraftBodyUnsupported}
                value={templateDraft.body}
              />
              <p style={templateDraftHasUnsupported ? settingsErrorStyle : notificationTemplateHelpStyle}>
                {templateDraftHasUnsupported
                  ? "Remove the red unsupported variable before saving or sending a test."
                  : "Variables stay connected to customer data even though the original template syntax is hidden."}
              </p>
            </div>
            <aside aria-label="Email preview and test" style={notificationTemplatePreviewPanelStyle}>
              <div style={notificationTemplatePreviewHeaderStyle}>
                <div>
                  <strong>Email preview</strong>
                  <p style={notificationTemplatePreviewHintStyle}>Example customer data</p>
                </div>
                <span style={notificationTemplatePreviewBadgeStyle}>Live</span>
              </div>
              <NotificationPreview activeTemplate={templateDraft} branding={branding} etaWindow={settings.etaWindow} senderName={settings.senderName} signal={templateEditorSignal} />
              <CustomerEmailTestSendPanel
                attemptId={intent === "testCustomerEmail" && fetcher.data ? fetcher.data.attemptId : null}
                busy={busy}
                confirmed={testConfirmed}
                errors={errors}
                onConfirmedChange={setTestConfirmed}
                onRecipientChange={setTestRecipient}
                onSend={() => submit("testCustomerEmail")}
                recipient={testRecipient}
                testBusy={testBusy}
                unsupported={templateDraftHasUnsupported}
              />
            </aside>
          </div>
          <div style={notificationModalFooterStyle}>
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
      <section aria-label={ariaLabel} aria-modal="true" className="customer-notification-modal" role="dialog" style={notificationModalStyle}>
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
    xhr.open("POST", CUSTOMER_EMAIL_LOGO_UPLOAD_PATH);
    xhr.setRequestHeader("Accept", "application/json");
    const sessionToken = formData.get("shopifySessionToken");
    if (typeof sessionToken === "string" && sessionToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${sessionToken}`);
    }
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

function NotificationPreview({ activeTemplate, branding, etaWindow, senderName, signal }) {
  const shopify = useAppBridge();
  const { data: previewData, state: previewState, submit: submitPreview } = useFetcher();
  const activeRequestIdRef = useRef(null);
  const requestSequenceRef = useRef(0);
  const [preview, setPreview] = useState(null);
  const [previewStatus, setPreviewStatus] = useState({ kind: "loading", message: "Preparing preview…" });
  const previewPayload = JSON.stringify({
    branding,
    etaWindow,
    senderName,
    signal,
    template: { body: activeTemplate.body ?? "", subject: activeTemplate.subject ?? "" },
  });

  useEffect(() => {
    const requestId = `${Date.now()}-${requestSequenceRef.current += 1}`;
    activeRequestIdRef.current = requestId;
    setPreviewStatus({ kind: "loading", message: "Updating preview…" });
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void shopify.idToken().then((shopifySessionToken) => {
        if (cancelled || requestId !== activeRequestIdRef.current) return;
        const formData = new FormData();
        formData.set("payload", previewPayload);
        formData.set("requestId", requestId);
        formData.set("shopifySessionToken", shopifySessionToken);
        submitPreview(formData, { action: CUSTOMER_EMAIL_PREVIEW_PATH, method: "post" });
      }).catch(() => {
        if (cancelled || requestId !== activeRequestIdRef.current) return;
        setPreviewStatus({ kind: "error", message: "Unable to authenticate the preview request." });
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [previewPayload, shopify, submitPreview]);

  useEffect(() => {
    if (previewState !== "idle" || !previewData) return;
    if (previewData.requestId !== activeRequestIdRef.current) {
      setPreviewStatus({ kind: "stale", message: "A newer edit is loading. The older preview was ignored." });
      return;
    }
    if (previewData.errors?.length > 0 || !previewData.preview?.html) {
      setPreviewStatus({
        kind: "error",
        message: previewData.errors?.[0]?.message ?? "The server did not return an email preview.",
      });
      return;
    }
    setPreview(previewData.preview);
    setPreviewStatus({ kind: "idle", message: "Preview is current." });
  }, [previewData, previewState]);

  return (
    <div aria-busy={previewStatus.kind === "loading"} aria-label="Live notification preview">
      <p aria-live="polite" style={notificationPreviewStatusStyle}>
        {previewStatus.message}{previewStatus.kind === "error" && preview ? " Showing the last successful preview." : ""}
      </p>
      <CustomerEmailPreviewFrame
        fallbackText={preview?.body}
        html={preview?.html}
        title={`${preview?.subject ?? "Customer email"} preview`}
      />
    </div>
  );
}

// Same pill toggle as the inventory detail view switch; a native select popup cannot be driven inside the admin iframe.
const etaWindowToggleStyle = {
  background: "#f6f6f7",
  border: "1px solid #d6d6d6",
  borderRadius: "999px",
  display: "inline-flex",
  gap: "2px",
  justifySelf: "start",
  padding: "2px",
};

const etaWindowToggleButtonStyle = {
  background: "transparent",
  border: 0,
  borderRadius: "999px",
  color: "#616161",
  cursor: "pointer",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: "16px",
  padding: "6px 12px",
};

const activeEtaWindowToggleButtonStyle = {
  ...etaWindowToggleButtonStyle,
  background: "#202223",
  color: "#ffffff",
};

function notificationPreviewLogoStyle(logoWidth) {
  return {
    display: "block",
    height: "auto",
    justifySelf: "start",
    maxWidth: "100%",
    objectFit: "contain",
    width: `${logoWidth}px`,
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

const notificationUploadedLogoPreviewStyle = {
  alignItems: "center",
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  display: "flex",
  minHeight: "88px",
  padding: "12px",
};

const notificationBrandingEditorLayoutStyle = {
  alignItems: "start",
  display: "grid",
  gap: "20px",
  gridTemplateColumns: "minmax(280px, 360px) minmax(0, 1fr)",
  minHeight: 0,
};

const notificationBrandingEditorPaneStyle = {
  alignContent: "start",
  display: "grid",
  gap: "12px",
  maxHeight: "calc(100vh - 164px)",
  minHeight: 0,
  overflowY: "auto",
  paddingRight: "6px",
};

const notificationBrandingPreviewPaneStyle = {
  alignContent: "start",
  display: "grid",
  gap: "12px",
  maxHeight: "calc(100vh - 164px)",
  minWidth: 0,
  overflowY: "auto",
  paddingRight: "6px",
};

const notificationBrandingActionsStyle = {
  alignItems: "center",
  background: "#ffffff",
  borderTop: "1px solid #e3e3e3",
  bottom: 0,
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  padding: "12px 0 4px",
  position: "sticky",
  zIndex: 1,
};

const notificationCardHeaderStyle = {
  alignItems: "start",
  display: "flex",
  gap: "16px",
  justifyContent: "space-between",
};

const notificationTemplateTableFrameStyle = {
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  overflowX: "auto",
};

const notificationTemplateTableStyle = {
  borderCollapse: "collapse",
  color: "#303030",
  tableLayout: "fixed",
  textAlign: "left",
  width: "100%",
};

const notificationTemplateHeaderRowStyle = {
  background: "#f7f7f7",
};

const notificationTemplateHeaderCellStyle = {
  borderBottom: "1px solid #e3e3e3",
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  padding: "9px 12px",
  width: "28%",
};

const notificationTemplateStatusHeaderStyle = {
  ...notificationTemplateHeaderCellStyle,
  width: "100px",
};

const notificationTemplateActionHeaderStyle = {
  ...notificationTemplateHeaderCellStyle,
  width: "72px",
};

const notificationTemplateRowStyle = {
  borderBottom: "1px solid #e3e3e3",
};

const notificationTemplateNameCellStyle = {
  fontSize: "14px",
  fontWeight: 650,
  padding: "13px 12px",
};

const notificationTemplateSubjectCellStyle = {
  color: "#616161",
  fontSize: "13px",
  overflow: "hidden",
  padding: "13px 12px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const notificationTemplateEmptyTextStyle = {
  color: "#8a8a8a",
  fontStyle: "italic",
};

const notificationTemplateStatusCellStyle = {
  padding: "13px 12px",
};

const notificationTemplateActionCellStyle = {
  padding: "8px 12px",
  textAlign: "right",
};

const notificationTemplateEditButtonStyle = {
  appearance: "none",
  background: "transparent",
  border: 0,
  borderRadius: "6px",
  color: "#005bd3",
  cursor: "pointer",
  font: "inherit",
  fontSize: "13px",
  fontWeight: 650,
  padding: "7px 8px",
};

const notificationTemplateEditorLayoutStyle = {
  display: "grid",
  gap: "18px",
  gridTemplateColumns: "minmax(0, 1.05fr) minmax(340px, 0.95fr)",
};

const notificationTemplateComposerStyle = {
  alignContent: "start",
  display: "grid",
  gap: "14px",
  minWidth: 0,
};

const notificationTemplateEditorIntroStyle = {
  alignItems: "start",
  display: "flex",
  gap: "16px",
  justifyContent: "space-between",
};

const notificationTemplateEnabledToggleStyle = {
  alignItems: "center",
  display: "flex",
  flex: "0 0 auto",
  fontSize: "13px",
  fontWeight: 650,
  gap: "7px",
};

const notificationTemplateHelpStyle = {
  color: "#616161",
  fontSize: "12px",
  lineHeight: "18px",
  margin: 0,
};

const notificationTemplatePreviewPanelStyle = {
  alignContent: "start",
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  display: "grid",
  gap: "12px",
  minWidth: 0,
  padding: "14px",
};

const notificationTemplatePreviewHeaderStyle = {
  alignItems: "start",
  display: "flex",
  justifyContent: "space-between",
};

const notificationTemplatePreviewHintStyle = {
  color: "#616161",
  fontSize: "12px",
  margin: "3px 0 0",
};

const notificationTemplatePreviewBadgeStyle = {
  background: "#eaf4ee",
  borderRadius: "999px",
  color: "#17663a",
  fontSize: "11px",
  fontWeight: 700,
  padding: "3px 8px",
};

const notificationModalFooterStyle = {
  alignItems: "center",
  borderTop: "1px solid #e3e3e3",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  margin: "2px -18px -18px",
  padding: "14px 18px 0",
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
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  maxHeight: "calc(100vh - 32px)",
  maxWidth: "1180px",
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
  boxSizing: "border-box",
  display: "grid",
  gap: "14px",
  maxHeight: "calc(100vh - 82px)",
  minHeight: 0,
  overflowY: "auto",
  padding: "18px",
};

const CUSTOMER_NOTIFICATION_RESPONSIVE_CSS = `
@media (max-width: 900px) {
  .customer-notification-branding-editor {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .customer-notification-template-editor {
    grid-template-columns: minmax(0, 1fr) !important;
  }

  .customer-notification-modal {
    max-width: 760px !important;
  }
}

@media (max-width: 620px) {
  .customer-notification-template-table {
    margin-inline: -12px;
  }

  .customer-notification-template-table table {
    min-width: 640px;
  }
}
`;

const notificationPreviewStatusStyle = {
  color: "#57606a",
  fontSize: "12px",
  lineHeight: "18px",
  margin: "0 0 8px",
};

export const ErrorBoundary = AdminRouteErrorBoundary;

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
