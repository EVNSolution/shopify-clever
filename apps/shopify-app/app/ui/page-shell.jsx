/* eslint-disable react/prop-types */
const shellStyle = {
  padding: "8px 12px 16px",
};

const contentStyle = {
  display: "grid",
  gap: "12px",
};

const headerStyle = {
  display: "grid",
  gap: "4px",
};

const headerTitleRowStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "10px",
  justifyContent: "space-between",
};

const headerActionStyle = {
  alignItems: "center",
  display: "flex",
  flexShrink: 0,
};

const eyebrowStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.04em",
  lineHeight: 1.2,
  margin: 0,
  textTransform: "uppercase",
};

const titleStyle = {
  color: "#202223",
  fontFamily: "inherit",
  fontSize: "20px",
  fontWeight: 600,
  lineHeight: "28px",
  margin: 0,
};

const descriptionStyle = {
  color: "#616161",
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
  maxWidth: "760px",
};

const sectionStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  display: "grid",
  gap: "10px",
  minWidth: 0,
  padding: "14px",
};

const sectionHeaderStyle = {
  alignItems: "start",
  display: "flex",
  gap: "10px",
  justifyContent: "space-between",
};

const sectionTitleStyle = {
  color: "#303030",
  fontFamily: "inherit",
  fontSize: "14px",
  fontWeight: 700,
  lineHeight: "20px",
  margin: 0,
};

const sectionDescriptionStyle = {
  color: "#616161",
  fontSize: "13px",
  lineHeight: "20px",
  margin: 0,
};

const valueListStyle = {
  display: "grid",
  gap: "8px",
  margin: 0,
};

const valueListItemStyle = {
  borderTop: "1px solid #ececec",
  display: "grid",
  gap: "2px",
  paddingTop: "8px",
};

const valueListTermStyle = {
  color: "#616161",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.25,
};

const valueListDescriptionStyle = {
  color: "#303030",
  fontSize: "13px",
  lineHeight: 1.4,
  margin: 0,
};

const noteStyle = {
  background: "#f7f7f7",
  border: "1px solid #e3e3e3",
  borderRadius: "10px",
  color: "#4a4a4a",
  fontSize: "13px",
  lineHeight: 1.45,
  padding: "10px 12px",
};

const noteToneStyles = {
  info: noteStyle,
  warning: {
    ...noteStyle,
    background: "#fff8e5",
    borderColor: "#f1dfab",
    color: "#5f4b13",
  },
  success: {
    ...noteStyle,
    background: "#effaf4",
    borderColor: "#bfe8cf",
    color: "#255c3b",
  },
};

const pillStyle = {
  alignItems: "center",
  borderRadius: "999px",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 700,
  lineHeight: 1.2,
  padding: "4px 9px",
  whiteSpace: "nowrap",
};

const pillToneStyles = {
  neutral: {
    ...pillStyle,
    background: "#f1f1f1",
    color: "#616161",
  },
  blue: {
    ...pillStyle,
    background: "#eaf4ff",
    color: "#174a7c",
  },
  green: {
    ...pillStyle,
    background: "#e5f5ec",
    color: "#0b6b3a",
  },
  amber: {
    ...pillStyle,
    background: "#fff1b8",
    color: "#4f3f00",
  },
};

export function PageShell({ title, eyebrow, description, headerAction, children }) {
  return (
    <main className="page-shell" style={shellStyle}>
      <div style={contentStyle}>
        <header className="page-shell__header" style={headerStyle}>
          {eyebrow ? <p style={eyebrowStyle}>{eyebrow}</p> : null}
          {title || headerAction ? (
            <div style={headerTitleRowStyle}>
              {title ? <h1 style={titleStyle}>{title}</h1> : null}
              {headerAction ? <div style={headerActionStyle}>{headerAction}</div> : null}
            </div>
          ) : null}
          {description ? <p style={descriptionStyle}>{description}</p> : null}
        </header>
        {children}
      </div>
    </main>
  );
}

export function PageGrid({ children, columns = "two" }) {
  return (
    <div className={`page-grid page-grid--${columns}`}>
      {children}
    </div>
  );
}

export function PageSection({ title, description, badge, ariaLabel, children }) {
  return (
    <section className="page-section" style={sectionStyle} aria-label={ariaLabel ?? title}>
      {title || description || badge ? (
        <div style={sectionHeaderStyle}>
          <div>
            {title ? <h2 style={sectionTitleStyle}>{title}</h2> : null}
            {description ? <p style={sectionDescriptionStyle}>{description}</p> : null}
          </div>
          {badge}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ValueList({ items }) {
  return (
    <dl className="value-list" style={valueListStyle}>
      {items.map((item) => (
        <div key={item.label} style={valueListItemStyle}>
          <dt style={valueListTermStyle}>{item.label}</dt>
          <dd style={valueListDescriptionStyle}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusPill({ tone = "neutral", children }) {
  return <span style={pillToneStyles[tone] ?? pillToneStyles.neutral}>{children}</span>;
}

export function PageNote({ tone = "info", children }) {
  return <div style={noteToneStyles[tone] ?? noteToneStyles.info}>{children}</div>;
}
