/* eslint-disable react/prop-types */
import { useEffect, useState } from "react";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  fetchCustomerEmailSettings,
  saveCustomerEmailSettings,
  sendCustomerEmailTest,
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

const BRANDING_COLOR_FIELDS = [
  ["accentColor", "Accent"],
  ["backgroundColor", "Background"],
  ["surfaceColor", "Surface"],
  ["textColor", "Text"],
];

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
      confirmed: formData.get("confirmed") === "true",
      recipientEmail,
      signal,
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

function updateNestedSettings(current, section, field, value) {
  return {
    ...current,
    [section]: {
      ...current[section],
      [field]: value,
    },
  };
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
  const [testConfirmed, setTestConfirmed] = useState(false);
  const intent = fetcher.formData?.get("_intent");
  const busy = fetcher.state !== "idle";
  const activeTemplate = settings.templates[activeSignal] ?? { body: "", subject: "" };
  const branding = settings.branding;
  const errors = fetcher.data?.errors ?? [];
  const saveBusy = busy && intent === "saveCustomerEmailSettings";
  const testBusy = busy && intent === "testCustomerEmail";

  useEffect(() => {
    if (!fetcher.data?.customerEmailSettings || errors.length > 0) return;
    setSettings(normalizeCustomerEmailSettings(fetcher.data.customerEmailSettings));
  }, [errors.length, fetcher.data?.customerEmailSettings]);

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
      formData.set("confirmed", String(testConfirmed));
      formData.set("recipientEmail", testRecipient);
      formData.set("signal", activeSignal);
    } else {
      formData.set("senderName", settings.senderName);
      formData.set("senderEmail", settings.senderEmail);
      formData.set("replyTo", settings.replyTo);
      formData.set("nearbyStopsThreshold", String(settings.nearbyStopsThreshold));
      for (const [field] of BRANDING_COLOR_FIELDS) {
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

  const updateTemplate = (field, value) => {
    setSettings((current) => ({
      ...current,
      templates: {
        ...current.templates,
        [activeSignal]: { ...current.templates[activeSignal], [field]: value },
      },
    }));
  };

  const updateBranding = (field, value) => {
    setSettings((current) => updateNestedSettings(current, "branding", field, value));
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
        <strong>Branding</strong>
        <div style={settingsCoordinateGridStyle}>
          {BRANDING_COLOR_FIELDS.map(([field, label]) => (
            <label key={field} style={settingsLabelStyle}>
              {label} color
              <input onChange={(event) => updateBranding(field, event.target.value)} style={settingsInputStyle} type="color" value={branding[field]} />
            </label>
          ))}
        </div>
        <div style={settingsCoordinateGridStyle}>
          <label style={settingsLabelStyle}>HTTPS logo URL<input onChange={(event) => updateBranding("logoUrl", event.target.value)} placeholder="https://cdn.example.com/logo.png" style={settingsInputStyle} type="url" value={branding.logoUrl} /></label>
          <label style={settingsLabelStyle}>Logo mode<select onChange={(event) => updateBranding("logoMode", event.target.value)} style={settingsSelectStyle} value={branding.logoMode}><option value="hidden">Hidden</option><option value="image">Image</option></select></label>
        </div>
        <div style={settingsCoordinateGridStyle}>
          <label style={settingsLabelStyle}>Logo width<input max="320" min="48" onChange={(event) => updateBranding("logoWidth", Number(event.target.value))} style={settingsInputStyle} type="number" value={branding.logoWidth} /></label>
          <label style={settingsLabelStyle}>Logo link<input onChange={(event) => updateBranding("logoLinkUrl", event.target.value)} placeholder="https://store.example.com" style={settingsInputStyle} type="url" value={branding.logoLinkUrl} /></label>
        </div>
        <label style={settingsLabelStyle}>Logo alt text<input onChange={(event) => updateBranding("logoAltText", event.target.value)} style={settingsInputStyle} value={branding.logoAltText} /></label>
        <label style={settingsLabelStyle}>Preview text<input onChange={(event) => updateBranding("previewText", event.target.value)} style={settingsInputStyle} value={branding.previewText} /></label>
        <label style={settingsLabelStyle}>Footer text<input onChange={(event) => updateBranding("footerText", event.target.value)} style={settingsInputStyle} value={branding.footerText} /></label>
        <label style={{ ...settingsLabelStyle, alignItems: "center", display: "flex", gridTemplateColumns: "auto 1fr" }}>
          <input checked={branding.showPoweredByClever} onChange={(event) => updateBranding("showPoweredByClever", event.target.checked)} type="checkbox" />
          Show powered by CLEVER
        </label>
        <NotificationPreview activeTemplate={activeTemplate} branding={branding} senderName={settings.senderName} />
      </section>

      <section aria-label="Email templates" style={settingsSectionCardStyle}>
        <strong>Templates</strong>
        <div aria-label="Email templates" role="tablist" style={settingsTemplateTabsStyle}>
          {CUSTOMER_EMAIL_SIGNALS.map(([signal, label]) => (
            <button aria-selected={activeSignal === signal} key={signal} onClick={() => setActiveSignal(signal)} role="tab" style={activeSignal === signal ? settingsButtonStyle : settingsResetButtonStyle} type="button">{label}</button>
          ))}
        </div>
        <label style={settingsLabelStyle}>Subject<input onChange={(event) => updateTemplate("subject", event.target.value)} style={settingsInputStyle} value={activeTemplate.subject} /></label>
        <label style={settingsLabelStyle}>Body<textarea onChange={(event) => updateTemplate("body", event.target.value)} style={settingsTextareaStyle} value={activeTemplate.body} /></label>
        <p style={settingsMessageStyle}>Variables are rendered by the delivery server. Unknown variables are rejected before sending.</p>
        <div style={settingsActionRowStyle}>
          <span>{intent === "saveCustomerEmailSettings" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Email settings saved</span> : null}</span>
          <button disabled={busy} onClick={() => submit("saveCustomerEmailSettings")} style={busy ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{saveBusy ? "Saving..." : "Save notification settings"}</button>
        </div>
      </section>

      <section aria-label="Send a test notification" style={settingsSectionCardStyle}>
        <strong>Send a test</strong>
        <p style={settingsMessageStyle}>A test goes only to the address entered below. It does not use customer data.</p>
        <input aria-label="Test recipient email" onChange={(event) => setTestRecipient(event.target.value)} placeholder="name@example.com" style={settingsInputStyle} type="email" value={testRecipient} />
        <label style={{ ...settingsLabelStyle, alignItems: "center", display: "flex", gridTemplateColumns: "auto 1fr" }}>
          <input checked={testConfirmed} onChange={(event) => setTestConfirmed(event.target.checked)} type="checkbox" />
          Confirm one test email to this address
        </label>
        <div style={settingsActionRowStyle}>
          <span>{intent === "testCustomerEmail" && !busy && errors.length === 0 && fetcher.data ? <span style={settingsSaveStatusStyle}>Test email accepted{fetcher.data.attemptId ? ` Ref ${fetcher.data.attemptId.slice(0, 8)}` : ""}</span> : null}</span>
          <button disabled={busy || !testConfirmed || !testRecipient} onClick={() => submit("testCustomerEmail")} style={busy || !testConfirmed || !testRecipient ? settingsDisabledButtonStyle : settingsButtonStyle} type="button">{testBusy ? "Sending..." : "Send test"}</button>
        </div>
      </section>

      {errors.length > 0 ? <p role="alert" style={settingsErrorStyle}>{errors[0]?.message ?? "Unable to save email settings."}</p> : null}
    </div>
  );
}

function NotificationPreview({ activeTemplate, branding, senderName }) {
  const logo = branding.logoMode === "image" && branding.logoUrl.startsWith("https://");
  const logoWidth = Math.max(48, Math.min(320, Number(branding.logoWidth) || DEFAULT_BRANDING.logoWidth));
  const subject = activeTemplate.subject || "Delivery scheduled";
  const body = activeTemplate.body || "Hi {{ customer.firstName }}, your delivery is scheduled.";

  return (
    <div aria-label="Live notification preview" style={{ background: branding.backgroundColor, border: "1px solid #d6d6d6", borderRadius: "8px", display: "grid", gap: "10px", padding: "12px" }}>
      <span style={{ color: "#616161", fontSize: "12px", lineHeight: 1.3 }}>{branding.previewText}</span>
      <div style={{ background: branding.surfaceColor, borderRadius: "8px", color: branding.textColor, display: "grid", gap: "10px", padding: "14px" }}>
        {logo ? (
          branding.logoLinkUrl.startsWith("https://") ? (
            <a href={branding.logoLinkUrl} rel="noreferrer" target="_blank"><img alt={branding.logoAltText || senderName || "Store logo"} src={branding.logoUrl} style={{ display: "block", maxWidth: "100%", width: `${logoWidth}px` }} /></a>
          ) : (
            <img alt={branding.logoAltText || senderName || "Store logo"} src={branding.logoUrl} style={{ display: "block", maxWidth: "100%", width: `${logoWidth}px` }} />
          )
        ) : null}
        <strong style={{ color: branding.textColor, fontSize: "16px", lineHeight: "22px" }}>{subject}</strong>
        <p style={{ lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{body}</p>
        <div style={{ borderTop: `1px solid ${branding.accentColor}`, display: "grid", gap: "4px", paddingTop: "10px" }}>
          <span style={{ color: branding.textColor, fontSize: "12px" }}>{branding.footerText}</span>
          {branding.showPoweredByClever ? <span style={{ color: branding.accentColor, fontSize: "12px", fontWeight: 700 }}>Powered by CLEVER</span> : null}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
