/* eslint-disable react/prop-types */
import { InfoPill } from "./info-pill";

export function OperationalPillGroup({ ariaLabel = "Operational state", pills = [] }) {
  return (
    <div aria-label={ariaLabel} className="operational-pill-group">
      {pills.map((item) => (
        <InfoPill ariaLabel={item.ariaLabel} key={item.key} title={item.ariaLabel} tone={item.tone}>
          {item.label}
        </InfoPill>
      ))}
    </div>
  );
}
