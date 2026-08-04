/* eslint-disable react/prop-types */
import { Link, useLocation } from "react-router";

export const settingsPageStyle = {
  display: "grid",
  gap: "12px",
  width: "100%",
};

export const settingsContentStyle = {
  display: "grid",
  gap: "12px",
  maxWidth: "760px",
  minWidth: 0,
  width: "100%",
};

export const settingsFormStyle = {
  display: "grid",
  gap: "12px",
};

export const settingsFieldsetStyle = {
  border: 0,
  display: "grid",
  gap: "10px",
  margin: 0,
  padding: 0,
};

export const settingsLegendStyle = {
  color: "#202223",
  fontSize: "15px",
  fontWeight: 700,
  lineHeight: "20px",
  marginBottom: "2px",
  padding: 0,
};

export const settingsLabelStyle = {
  color: "#303030",
  display: "grid",
  fontSize: "13px",
  fontWeight: 650,
  gap: "4px",
};

export const settingsCoordinateGridStyle = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
};

export const settingsInputStyle = {
  background: "#ffffff",
  border: "1px solid #c9c9c9",
  borderRadius: "8px",
  boxSizing: "border-box",
  color: "#303030",
  font: "inherit",
  minHeight: "36px",
  padding: "7px 10px",
  width: "100%",
};

export const settingsSelectStyle = {
  ...settingsInputStyle,
  height: "36px",
  lineHeight: "20px",
};

export const settingsReadonlyInputStyle = {
  ...settingsInputStyle,
  background: "#f7f7f7",
  color: "#616161",
};

export const settingsMapControlRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

export const settingsActionRowStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "space-between",
  minHeight: "34px",
};

export const settingsButtonGroupStyle = {
  alignItems: "center",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

export const settingsSaveStatusStyle = {
  alignItems: "center",
  color: "#008060",
  display: "inline-flex",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "20px",
  margin: 0,
  minHeight: "34px",
};

export const settingsButtonStyle = {
  background: "#303030",
  border: "1px solid #303030",
  borderRadius: "8px",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "34px",
  padding: "6px 12px",
};

export const settingsResetButtonStyle = {
  ...settingsButtonStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};

export const settingsDisabledButtonStyle = {
  ...settingsResetButtonStyle,
  cursor: "not-allowed",
  opacity: 0.58,
};

export const settingsMessageStyle = {
  color: "#616161",
  fontSize: "13px",
  lineHeight: "18px",
  margin: 0,
};

export const settingsErrorStyle = {
  ...settingsMessageStyle,
  color: "#8e1f0b",
};

export const settingsSectionCardStyle = {
  border: "1px solid #e3e3e3",
  borderRadius: "8px",
  display: "grid",
  gap: "12px",
  padding: "14px",
};

export const settingsTemplateTabsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
};

export const settingsTextareaStyle = {
  ...settingsInputStyle,
  minHeight: "140px",
  resize: "vertical",
};

const SETTINGS_SECTIONS = [
  { href: "/app/settings", label: "General", match: (pathname) => pathname === "/app/settings" },
  {
    href: "/app/settings/notifications",
    label: "Customer Notifications",
    match: (pathname) => pathname === "/app/settings/notifications",
  },
];

export function SettingsLayout({ children }) {
  return (
    <div className="settings-layout" style={settingsPageStyle}>
      <SettingsLayoutStyles />
      <SettingsInternalNav />
      <div style={settingsContentStyle}>{children}</div>
    </div>
  );
}

function SettingsInternalNav() {
  const location = useLocation();

  return (
    <nav aria-label="Settings sections" className="settings-internal-nav">
      {SETTINGS_SECTIONS.map((section) => {
        const active = section.match(location.pathname);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={`settings-internal-nav__link${active ? " settings-internal-nav__link--active" : ""}`}
            key={section.href}
            to={section.href}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SettingsLayoutStyles() {
  return (
    <style>{`
      .settings-layout {
        grid-template-columns: 160px minmax(0, 760px);
        align-items: start;
      }

      .settings-internal-nav {
        display: grid;
        gap: 4px;
        position: sticky;
        top: 8px;
      }

      .settings-internal-nav__link {
        border-left: 2px solid transparent;
        color: #616161;
        font-size: 13px;
        font-weight: 650;
        line-height: 18px;
        min-height: 30px;
        padding: 6px 8px;
        text-decoration: none;
      }

      .settings-internal-nav__link--active {
        border-left-color: #008060;
        color: #202223;
      }

      @media (max-width: 760px) {
        .settings-layout {
          grid-template-columns: minmax(0, 1fr);
        }

        .settings-internal-nav {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding-bottom: 2px;
          position: static;
          scrollbar-width: thin;
        }

        .settings-internal-nav__link {
          border: 1px solid #d6d6d6;
          border-radius: 999px;
          flex: 0 0 auto;
          padding: 5px 10px;
          white-space: nowrap;
        }

        .settings-internal-nav__link--active {
          background: #effaf4;
          border-color: #008060;
        }
      }
    `}</style>
  );
}
