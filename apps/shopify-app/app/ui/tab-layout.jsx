/* eslint-disable react/prop-types */
const layoutStyle = {
  padding: "8px 12px 12px",
};

const pageStyle = {
  display: "grid",
  gap: "12px",
};

const headerStyle = {
  display: "grid",
  gap: "4px",
};

const titleStyle = {
  margin: 0,
  fontFamily: "inherit",
  fontSize: "20px",
  fontWeight: "600",
  lineHeight: "28px",
};

const descriptionStyle = {
  margin: 0,
  color: "#616161",
  fontSize: "13px",
  lineHeight: "20px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 0.6fr)",
  gap: "12px",
  alignItems: "stretch",
};

const expandedGridStyle = {
  ...gridStyle,
  gridTemplateColumns: "minmax(0, 1fr)",
};

const primaryStyle = {
  minHeight: "420px",
  border: "1px solid #d4d4d4",
  borderRadius: "12px",
  background: "#ffffff",
  overflow: "hidden",
};

const secondaryStyle = {
  minHeight: "420px",
  border: "1px solid #d4d4d4",
  borderRadius: "12px",
  background: "#ffffff",
  overflow: "hidden",
};

const lowerStyle = {
  minHeight: "160px",
  border: "1px solid #d4d4d4",
  borderRadius: "12px",
  background: "#ffffff",
  overflow: "hidden",
};

export function TabLayout({ title, description, primary, secondary, lower, primaryExpanded = false }) {
  const activeGridStyle = primaryExpanded ? expandedGridStyle : gridStyle;

  return (
    <main className="tab-layout" style={layoutStyle}>
      <div style={pageStyle}>
        <header className="tab-layout-header" style={headerStyle}>
          <h1 style={titleStyle}>{title}</h1>
          {description ? <p style={descriptionStyle}>{description}</p> : null}
        </header>

        <div className="tab-layout-grid" style={activeGridStyle}>
          <section className="tab-layout-primary" style={primaryStyle}>
            {primary}
          </section>
          {!primaryExpanded && secondary ? (
            <aside className="tab-layout-secondary" style={secondaryStyle}>
              {secondary}
            </aside>
          ) : null}
        </div>

        <section className="tab-layout-lower" style={lowerStyle}>{lower}</section>
      </div>
    </main>
  );
}
