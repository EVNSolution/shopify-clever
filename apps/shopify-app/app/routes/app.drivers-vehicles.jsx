import { useEffect, useMemo, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { useFetcher, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  createPendingDeliveryDriver,
  deleteDeliveryDriver,
  fetchDeliveryDrivers,
  regenerateDeliveryDriverInviteCode,
  updateDeliveryDriverName,
} from "../features/delivery/drivers.server";
import {
  formatInvitePhoneInput,
  formatSavedDriverPhone,
  getDriverDownloadLink,
  normalizeInvitePhone,
} from "../features/drivers/phone-normalization";
import { countryDialCodeOptions, driverRows } from "../features/drivers/drivers-page-data";
import { authenticate } from "../shopify.server";
import { PageShell } from "../ui/page-shell";

const driversPageStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  margin: "0 auto",
  maxWidth: "1440px",
  minHeight: "calc(100vh - 48px)",
  width: "100%",
};

const pageHeaderStyle = {
  alignItems: "center",
  display: "flex",
  gap: "12px",
  justifyContent: "space-between",
  minHeight: "32px",
};

const pageTitleStyle = {
  color: "#202223",
  fontFamily: "inherit",
  fontSize: "20px",
  fontWeight: 700,
  lineHeight: "28px",
  margin: 0,
};

const pageActionsStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "flex-end",
};

const primaryButtonStyle = {
  background: "#303030",
  borderColor: "#303030",
  borderRadius: "8px",
  borderStyle: "solid",
  borderWidth: "1px",
  color: "#ffffff",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 650,
  minHeight: "32px",
  padding: "5px 12px",
};

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "#ffffff",
  borderColor: "#c9c9c9",
  color: "#303030",
};

const dangerButtonStyle = {
  ...secondaryButtonStyle,
  borderColor: "#d72c0d",
  color: "#d72c0d",
};

const disabledActionButtonStyle = {
  ...secondaryButtonStyle,
  cursor: "not-allowed",
  opacity: 0.55,
};

const toolbarStyle = {
  alignItems: "center",
  background: "#ffffff",
  borderBottom: "1px solid #e3e3e3",
  borderRadius: "12px 12px 0 0",
  display: "flex",
  flex: "0 0 auto",
  flexWrap: "wrap",
  gap: "8px",
  justifyContent: "space-between",
  padding: "8px 10px",
};

const searchInputStyle = {
  background: "#ffffff",
  boxSizing: "border-box",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  color: "#303030",
  flex: "1 1 280px",
  fontSize: "13px",
  minHeight: "32px",
  minWidth: "220px",
  padding: "5px 10px",
};

const toolbarSummaryStyle = {
  color: "#616161",
  fontSize: "13px",
  fontWeight: 650,
  whiteSpace: "nowrap",
};

const driverTableSurfaceStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "12px",
  display: "flex",
  flex: "1 1 auto",
  flexDirection: "column",
  minHeight: 0,
  overflow: "visible",
};

const tableWrapStyle = {
  background: "#ffffff",
  borderRadius: "0 0 12px 12px",
  flex: "1 1 auto",
  minHeight: 0,
  overflow: "visible",
};

const tableStyle = {
  borderCollapse: "separate",
  borderSpacing: 0,
  fontSize: "13px",
  tableLayout: "fixed",
  width: "100%",
};

const tableHeaderCellStyle = {
  background: "#ffffff",
  borderBottom: "1px solid #dcdfe4",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.06)",
  color: "#303030",
  fontWeight: 700,
  padding: "8px 10px",
  position: "sticky",
  textAlign: "left",
  top: 0,
  verticalAlign: "middle",
  zIndex: 2,
};

const checkboxHeaderCellStyle = {
  ...tableHeaderCellStyle,
  padding: "8px 8px",
  textAlign: "center",
};

const editHeaderCellStyle = {
  ...tableHeaderCellStyle,
  padding: 0,
  textAlign: "center",
};

const tableCellStyle = {
  borderBottom: "1px solid #ebebeb",
  color: "#303030",
  padding: "8px 10px",
  textAlign: "left",
  verticalAlign: "middle",
  wordBreak: "break-word",
};

const checkboxCellStyle = {
  ...tableCellStyle,
  padding: "8px 8px",
  textAlign: "center",
};

const editCellStyle = {
  ...tableCellStyle,
  padding: 0,
  textAlign: "center",
};

const editButtonStyle = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  borderRadius: "6px",
  color: "#616161",
  cursor: "pointer",
  display: "inline-flex",
  height: "28px",
  justifyContent: "center",
  padding: 0,
  width: "28px",
};

const appAccessCellStyle = {
  ...tableCellStyle,
  overflow: "hidden",
  whiteSpace: "nowrap",
  wordBreak: "normal",
};

const appAccessInlineStyle = {
  alignItems: "center",
  display: "flex",
  gap: "5px",
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const appAccessInlineButtonStyle = {
  background: "transparent",
  border: 0,
  color: "#174a7c",
  cursor: "pointer",
  flex: "0 0 auto",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  padding: 0,
  whiteSpace: "nowrap",
};

const inviteCodeInlineStyle = {
  alignItems: "center",
  color: "#303030",
  display: "inline-flex",
  flex: "1 1 auto",
  fontSize: "12px",
  fontWeight: 650,
  gap: "4px",
  lineHeight: 1.2,
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
};

const inviteCodeValueStyle = {
  flex: "0 0 auto",
};

const compactInviteButtonStyle = {
  ...secondaryButtonStyle,
  minHeight: "26px",
  padding: "2px 7px",
};

const statusPillStyle = {
  background: "rgba(0, 0, 0, 0.04)",
  borderRadius: "999px",
  color: "#303030",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 650,
  lineHeight: 1.2,
  padding: "3px 8px",
};

const driverFeedbackStyle = {
  background: "#fff4f4",
  border: "1px solid #ffd6d6",
  borderRadius: "10px",
  color: "#8e1f0b",
  fontSize: "13px",
  lineHeight: 1.4,
  padding: "10px 12px",
};

const assignedRouteTextStyle = {
  color: "#303030",
  fontWeight: 650,
};

const emptyRowStyle = {
  ...tableCellStyle,
  color: "#616161",
  padding: "18px 10px",
  textAlign: "center",
};

const modalBackdropStyle = {
  alignItems: "center",
  background: "rgba(0, 0, 0, 0.45)",
  bottom: 0,
  display: "flex",
  justifyContent: "center",
  left: 0,
  padding: "24px",
  position: "fixed",
  right: 0,
  top: 0,
  zIndex: 1000,
};

const modalStyle = {
  background: "#ffffff",
  borderRadius: "14px",
  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.28)",
  maxWidth: "600px",
  overflow: "hidden",
  width: "100%",
};

const modalHeaderStyle = {
  alignItems: "center",
  borderBottom: "1px solid #e3e3e3",
  display: "flex",
  justifyContent: "space-between",
  padding: "14px 16px",
};

const modalTitleStyle = {
  color: "#303030",
  fontSize: "15px",
  fontWeight: 700,
  margin: 0,
};

const closeButtonStyle = {
  background: "transparent",
  border: 0,
  color: "#616161",
  cursor: "pointer",
  fontSize: "22px",
  lineHeight: 1,
  padding: 0,
};

const modalBodyStyle = {
  display: "grid",
  gap: "10px",
  padding: "16px",
};

const phoneFieldStyle = {
  display: "grid",
  gap: "6px",
};

const phoneInputRowStyle = {
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "132px minmax(0, 1fr)",
};

const countryCodeButtonStyle = {
  alignItems: "center",
  boxSizing: "border-box",
  background: "#f7f7f7",
  border: "1px solid #c9c9c9",
  borderRadius: "8px 0 0 8px",
  color: "#303030",
  cursor: "pointer",
  display: "flex",
  fontSize: "13px",
  fontWeight: 650,
  gap: "7px",
  justifyContent: "space-between",
  minHeight: "40px",
  padding: "0 10px",
};

const countryCodeButtonValueStyle = {
  alignItems: "center",
  display: "inline-flex",
  gap: "6px",
  minWidth: 0,
};

const countryCodeAccordionStyle = {
  background: "#ffffff",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  display: "grid",
  maxHeight: "220px",
  overflowY: "auto",
};

const countryCodeOptionButtonStyle = {
  alignItems: "center",
  boxSizing: "border-box",
  background: "#ffffff",
  border: 0,
  borderBottom: "1px solid #ebebeb",
  color: "#303030",
  cursor: "pointer",
  display: "grid",
  fontSize: "13px",
  gap: "2px",
  gridTemplateColumns: "28px 1fr auto",
  minHeight: "38px",
  padding: "7px 10px",
  textAlign: "left",
};

const selectedCountryCodeOptionButtonStyle = {
  ...countryCodeOptionButtonStyle,
  background: "#f1f7ff",
};

const phoneInputStyle = {
  ...searchInputStyle,
  borderLeft: 0,
  boxSizing: "border-box",
  borderRadius: "0 8px 8px 0",
  flex: "0 0 auto",
  minHeight: "40px",
  minWidth: 0,
  width: "100%",
};

const driverNameInputStyle = {
  ...searchInputStyle,
  boxSizing: "border-box",
  flex: "0 0 auto",
  minHeight: "40px",
  minWidth: 0,
  width: "100%",
};

const fieldLabelStyle = {
  color: "#303030",
  display: "grid",
  fontSize: "13px",
  fontWeight: 700,
  gap: "6px",
};

const modalHelpStyle = {
  color: "#616161",
  fontSize: "13px",
  lineHeight: 1.4,
  margin: 0,
};

const inviteMessagePreviewStyle = {
  background: "#f6f6f7",
  border: "1px solid #d6d6d6",
  borderRadius: "8px",
  color: "#303030",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "12px",
  lineHeight: 1.5,
  margin: "8px 0 0",
  padding: "10px",
  whiteSpace: "pre-wrap",
};

const modalFooterStyle = {
  alignItems: "center",
  borderTop: "1px solid #e3e3e3",
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
  padding: "12px 16px",
};

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function buildDriverSearchText(driver) {
  return normalizeSearchText([
    driver.displayName,
    driver.phone,
    driver.status,
    driver.assignedRoute?.label,
    driver.joinedAt,
    driver.lastSeenAt,
  ].filter(Boolean).join(" "));
}

function mapDeliveryDriverToRow(driver) {
  if (!driver || typeof driver !== "object") return null;

  const phone = textOrFallback(formatSavedDriverPhone(driver.phone), driver.phone, "—");
  const driverId = textOrFallback(driver.id, phone, "pending-driver");
  const authStatusValue = String(driver.authStatus ?? "").toUpperCase();
  const statusValue = String(driver.status ?? "").toUpperCase();
  const invitePending = authStatusValue === "INVITE_PENDING" || statusValue === "PENDING";
  const appLinked = authStatusValue === "APP_LINKED" || Boolean(driver.authSubject);

  return {
    id: driverId,
    displayName: textOrFallback(driver.displayName, phone, "Pending driver"),
    phone,
    status: formatOperationalDriverStatus(driver.status, { invitePending }),
    isInvitePending: invitePending,
    isAppLinked: appLinked,
    inviteCode: driver.inviteCode,
    inviteCodeExpiresAt: driver.inviteCodeExpiresAt,
    assignedRoute: { label: "Unassigned" },
    joinedAt: formatDriverTimestamp(driver.createdAt) ?? "—",
    lastSeenAt: formatDriverTimestamp(driver.lastSeenAt) ?? null,
    recentEvents: formatRecentEvents(driver.recentEventsCount),
  };
}

function textOrFallback(...values) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }

  return "";
}

function formatDriverStatus(value) {
  const status = textOrFallback(value, "Active").toLowerCase();
  return status.charAt(0).toUpperCase() + status.slice(1).replaceAll("_", " ");
}

function formatOperationalDriverStatus(value, { invitePending } = {}) {
  if (invitePending) return "Active";
  return formatDriverStatus(value);
}

function formatDriverTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toISOString().slice(0, 10);
}

function formatRecentEvents(value) {
  if (typeof value !== "number" || value <= 0) return "No events";
  return value === 1 ? "1 event" : `${value} events`;
}

function buildDriverInviteMessage({ downloadLink, inviteCode }) {
  const code = textOrFallback(inviteCode, "저장 후 인증코드가 여기에 표시됩니다.");
  return `배송원 앱 다운로드 링크: ${downloadLink}\n인증코드: ${code}`;
}

function canShowDriverInviteActions(driver) {
  return driver?.isInvitePending === true;
}

function canShowDriverReloginAction(driver) {
  return driver?.isAppLinked === true && driver?.isInvitePending !== true;
}

function mergeDriverRows(baseRows, submittedRow) {
  if (!submittedRow) return baseRows;

  const rows = Array.isArray(baseRows) ? baseRows : [];
  const existingIndex = rows.findIndex((driver) => driver.id === submittedRow.id || driver.phone === submittedRow.phone);
  if (existingIndex === -1) return [submittedRow, ...rows];

  return rows.map((driver, index) => (index === existingIndex ? submittedRow : driver));
}

function formText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseDriverIds(value) {
  try {
    const parsedDriverIds = JSON.parse(value ?? "[]");

    return Array.isArray(parsedDriverIds)
      ? parsedDriverIds.map((driverId) => String(driverId).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  const result = await fetchDeliveryDrivers(request);
  return {
    ...result,
    driverDownloadLink: getDriverDownloadLink(),
  };
};

export const action = async ({ request }) => {
  await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formText(formData.get("_intent"));

  if (intent === "deleteDriver") {
    const driverIds = parseDriverIds(formData.get("driverIds"));
    const shopifySessionToken = formText(formData.get("shopifySessionToken"));

    if (driverIds.length === 0) {
      return { driverIds: [], errors: [{ message: "삭제할 배송원을 선택해주세요." }] };
    }

    const deleteResults = await Promise.all(
      driverIds.map((driverId) =>
        deleteDeliveryDriver(request, driverId, { sessionToken: shopifySessionToken }),
      ),
    );

    return {
      driverIds: deleteResults.map((result) => result.driverId).filter(Boolean),
      errors: deleteResults.flatMap((result) => result.errors ?? []),
    };
  }

  if (intent === "updateDriverName") {
    const driverId = formText(formData.get("driverId"));
    const displayName = formText(formData.get("displayName"));
    const shopifySessionToken = formText(formData.get("shopifySessionToken"));

    if (!driverId || !displayName || displayName.length > 80) {
      return { driver: null, errors: [{ message: "1~80자의 배송원 이름을 입력해주세요." }] };
    }

    return updateDeliveryDriverName(request, driverId, { displayName }, { sessionToken: shopifySessionToken });
  }

  if (intent === "regenerateInviteCode") {
    const driverId = formText(formData.get("driverId"));
    if (!driverId) return { driver: null, errors: [{ message: "배송원 ID가 필요합니다." }] };
    return regenerateDeliveryDriverInviteCode(request, driverId, { sessionToken: formText(formData.get("shopifySessionToken")) });
  }

  if (intent !== "inviteDriver") {
    return { driver: null, errors: [{ message: "지원하지 않는 driver 작업입니다." }] };
  }

  const phone = formText(formData.get("phone"));
  if (!phone) {
    return { driver: null, errors: [{ message: "배송원 전화번호가 필요합니다." }] };
  }

  return createPendingDeliveryDriver(
    request,
    {
      displayName: formText(formData.get("displayName")),
      inviteLink: formText(formData.get("inviteLink")),
      phone,
    },
    { sessionToken: formText(formData.get("shopifySessionToken")) },
  );
};

export default function DriversVehiclesPage() {
  const { driverDownloadLink = "", drivers = [], errors = [] } = useLoaderData();
  const driverInviteFetcher = useFetcher();
  const driverDeleteFetcher = useFetcher();
  const driverUpdateFetcher = useFetcher();
  const shopify = useAppBridge();
  const [searchText, setSearchText] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [selectedCountryCodeId, setSelectedCountryCodeId] = useState(countryDialCodeOptions[0].id);
  const [countryCodeOpen, setCountryCodeOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [pendingDownloadLink, setPendingDownloadLink] = useState("");
  const [checkedDriverIds, setCheckedDriverIds] = useState([]);
  const [deletedDriverIds, setDeletedDriverIds] = useState([]);
  const [editingDriver, setEditingDriver] = useState(null);
  const [editingDriverName, setEditingDriverName] = useState("");
  const [driverNameError, setDriverNameError] = useState("");
  const [pendingDriverNameId, setPendingDriverNameId] = useState("");

  const serverDriverRows = useMemo(
    () => (Array.isArray(drivers) ? drivers : []).map(mapDeliveryDriverToRow).filter(Boolean),
    [drivers],
  );
  const submittedDriverRow = useMemo(
    () => mapDeliveryDriverToRow(driverInviteFetcher.data?.driver),
    [driverInviteFetcher.data?.driver],
  );
  const submittedUpdatedDriverRow = useMemo(
    () => mapDeliveryDriverToRow(driverUpdateFetcher.data?.driver),
    [driverUpdateFetcher.data?.driver],
  );
  const baseDriverRows = serverDriverRows.length > 0 || errors.length === 0 ? serverDriverRows : driverRows;
  const allDrivers = useMemo(
    () => mergeDriverRows(mergeDriverRows(baseDriverRows, submittedDriverRow), submittedUpdatedDriverRow),
    [baseDriverRows, submittedDriverRow, submittedUpdatedDriverRow],
  );
  const deletedDriverIdSet = useMemo(() => new Set(deletedDriverIds), [deletedDriverIds]);
  const visibleDrivers = useMemo(
    () => allDrivers.filter((driver) => !deletedDriverIdSet.has(driver.id)),
    [allDrivers, deletedDriverIdSet],
  );

  const filteredDrivers = useMemo(() => {
    const query = normalizeSearchText(searchText);
    if (!query) return visibleDrivers;

    return visibleDrivers.filter((driver) => buildDriverSearchText(driver).includes(query));
  }, [searchText, visibleDrivers]);

  const selectableDriverRows = filteredDrivers;
  const checkedDriverIdSet = new Set(checkedDriverIds);
  const allVisibleDriversChecked =
    selectableDriverRows.length > 0 &&
    selectableDriverRows.every((driver) => checkedDriverIdSet.has(driver.id));
  const driverDeleteDisabled = checkedDriverIds.length === 0 || driverDeleteFetcher.state !== "idle";
  const driverDeleteErrors = Array.isArray(driverDeleteFetcher.data?.errors) ? driverDeleteFetcher.data.errors : [];
  const driverUpdateErrors = Array.isArray(driverUpdateFetcher.data?.errors) ? driverUpdateFetcher.data.errors : [];
  const visibleErrors = [...errors, ...driverDeleteErrors, ...driverUpdateErrors];

  const selectedCountryCode = countryDialCodeOptions.find((option) => option.id === selectedCountryCodeId) ?? countryDialCodeOptions[0];
  const currentInviteDriver = driverInviteFetcher.data?.driver ?? null;
  const currentInviteCode = currentInviteDriver?.inviteCode;
  const inviteMessagePreview = buildDriverInviteMessage({
    downloadLink: getDriverDownloadLink(driverDownloadLink),
    inviteCode: currentInviteCode,
  });

  const openInviteModal = () => {
    setInviteOpen(true);
    setCountryCodeOpen(false);
    setCopyStatus("");
  };

  const openDriverNameEditor = (driver) => {
    setEditingDriver(driver);
    setEditingDriverName(driver.displayName);
    setDriverNameError("");
  };

  const closeDriverNameEditor = () => {
    if (driverUpdateFetcher.state !== "idle") return;
    setEditingDriver(null);
    setEditingDriverName("");
    setDriverNameError("");
  };

  const saveDriverName = async () => {
    const displayName = editingDriverName.trim();
    if (!editingDriver?.id || !displayName || displayName.length > 80) {
      setDriverNameError("1~80자의 배송원 이름을 입력해주세요.");
      return;
    }
    if (driverUpdateFetcher.state !== "idle") return;

    try {
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", "updateDriverName");
      formData.set("driverId", editingDriver.id);
      formData.set("displayName", displayName);
      formData.set("shopifySessionToken", sessionToken);
      setPendingDriverNameId(editingDriver.id);
      setDriverNameError("");
      driverUpdateFetcher.submit(formData, { method: "post" });
    } catch {
      setDriverNameError("Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.");
    }
  };

  const getCurrentInvite = () => {
    const normalizedPhone = normalizeInvitePhone(selectedCountryCode.dialCode, invitePhone);
    return {
      downloadLink: getDriverDownloadLink(driverDownloadLink),
      normalizedPhone,
    };
  };

  const savePendingDriver = async () => {
    const { downloadLink, normalizedPhone } = getCurrentInvite();
    if (!downloadLink) {
      setCopyStatus("배송원 앱 다운로드 링크가 설정되지 않았습니다. 기본 APK 링크를 확인해주세요.");
      return;
    }

    if (!normalizedPhone || driverInviteFetcher.state !== "idle") {
      setCopyStatus(normalizedPhone ? "Pending driver registration is already running." : "Enter a valid driver phone number.");
      return;
    }

    setPendingDownloadLink(downloadLink);
    setCopyStatus("Saving pending driver...");

    try {
      const sessionToken = await shopify.idToken();
      const formData = new FormData();
      formData.set("_intent", "inviteDriver");
      formData.set("phone", normalizedPhone);
      formData.set("inviteLink", downloadLink);
      formData.set("shopifySessionToken", sessionToken);
      driverInviteFetcher.submit(formData, { method: "post" });
    } catch {
      setPendingDownloadLink("");
      setCopyStatus("Shopify session token을 가져오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해주세요.");
    }
  };

  const copyInviteMessage = async () => {
    if (!currentInviteCode) {
      setCopyStatus("배송원을 저장하거나 인증코드를 생성한 뒤 초대 메시지를 복사하세요.");
      return;
    }

    if (!navigator.clipboard?.writeText) {
      setCopyStatus("클립보드 복사 실패. 아래 내용을 직접 복사하세요:\n" + inviteMessagePreview);
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteMessagePreview);
      setCopyStatus("초대 메시지가 복사되었습니다.");
    } catch {
      setCopyStatus("클립보드 복사 실패. 아래 내용을 직접 복사하세요:\n" + inviteMessagePreview);
    }
  };

  useEffect(() => {
    if (!pendingDownloadLink || driverInviteFetcher.state !== "idle" || !driverInviteFetcher.data) return;

    const inviteErrors = Array.isArray(driverInviteFetcher.data.errors) ? driverInviteFetcher.data.errors : [];
    if (inviteErrors.length > 0) {
      setPendingDownloadLink("");
      setCopyStatus(inviteErrors[0]?.message ?? "Pending driver registration failed.");
      return;
    }

    if (!driverInviteFetcher.data.driver) return;

    setPendingDownloadLink("");
    setCopyStatus("Pending driver saved.");
  }, [driverInviteFetcher.data, driverInviteFetcher.state, pendingDownloadLink]);

  useEffect(() => {
    if (driverDeleteFetcher.state !== "idle" || !driverDeleteFetcher.data) return;
    if ((driverDeleteFetcher.data.errors ?? []).length > 0) return;

    const deletedIds = Array.isArray(driverDeleteFetcher.data.driverIds) ? driverDeleteFetcher.data.driverIds : [];
    setDeletedDriverIds((currentDriverIds) => Array.from(new Set([...currentDriverIds, ...deletedIds])));
    setCheckedDriverIds([]);
  }, [driverDeleteFetcher.data, driverDeleteFetcher.state]);

  useEffect(() => {
    if (!pendingDriverNameId || driverUpdateFetcher.state !== "idle" || !driverUpdateFetcher.data) return;

    const updateErrors = Array.isArray(driverUpdateFetcher.data.errors) ? driverUpdateFetcher.data.errors : [];
    if (updateErrors.length > 0) {
      setDriverNameError(updateErrors[0]?.message ?? "배송원 이름을 수정하지 못했습니다.");
      setPendingDriverNameId("");
      return;
    }

    if (!driverUpdateFetcher.data.driver) return;
    setEditingDriver(null);
    setEditingDriverName("");
    setDriverNameError("");
    setPendingDriverNameId("");
  }, [driverUpdateFetcher.data, driverUpdateFetcher.state, pendingDriverNameId]);

  const regenerateInviteCode = async (driverId) => {
    const sessionToken = await shopify.idToken();
    const formData = new FormData();
    formData.set("_intent", "regenerateInviteCode");
    formData.set("driverId", driverId);
    formData.set("shopifySessionToken", sessionToken);
    driverInviteFetcher.submit(formData, { method: "post" });
  };

  function toggleDriverCheck(driverId) {
    setCheckedDriverIds((currentDriverIds) =>
      currentDriverIds.includes(driverId)
        ? currentDriverIds.filter((currentDriverId) => currentDriverId !== driverId)
        : [...currentDriverIds, driverId],
    );
  }

  function toggleAllVisibleDriverChecks() {
    setCheckedDriverIds((currentDriverIds) => {
      if (allVisibleDriversChecked) {
        const visibleDriverIds = new Set(selectableDriverRows.map((driver) => driver.id));
        return currentDriverIds.filter((driverId) => !visibleDriverIds.has(driverId));
      }

      return Array.from(
        new Set([
          ...currentDriverIds,
          ...selectableDriverRows.map((driver) => driver.id),
        ]),
      );
    });
  }

  async function handleDeleteSelectedDrivers() {
    if (driverDeleteDisabled) return;

    const formData = new FormData();
    formData.set("_intent", "deleteDriver");
    formData.set("driverIds", JSON.stringify(checkedDriverIds));

    try {
      const sessionToken = await shopify.idToken();
      formData.set("shopifySessionToken", sessionToken);
    } catch {
      // The server action still returns an actionable auth error when the token cannot be fetched.
    }

    driverDeleteFetcher.submit(formData, { method: "post" });
  }

  return (
    <PageShell title={null}>
      <div style={driversPageStyle}>
      <div style={pageHeaderStyle}>
        <h1 style={pageTitleStyle}>Drivers</h1>
        <div style={pageActionsStyle}>
          <button type="button" style={primaryButtonStyle} onClick={openInviteModal}>Invite driver</button>
          <button
            type="button"
            style={driverDeleteDisabled ? disabledActionButtonStyle : dangerButtonStyle}
            disabled={driverDeleteDisabled}
            onClick={handleDeleteSelectedDrivers}
          >
            Delete selected
          </button>
        </div>
      </div>

      {visibleErrors.length > 0 ? (
        <div style={driverFeedbackStyle}>{visibleErrors[0].message ?? "Driver 작업을 완료하지 못했습니다."}</div>
      ) : null}

      <div style={driverTableSurfaceStyle}>
        <div style={toolbarStyle}>
          <input
            aria-label="Search drivers"
            placeholder="Search drivers"
            style={searchInputStyle}
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.currentTarget.value)}
          />
          <span style={toolbarSummaryStyle}>
            Drivers: {visibleDrivers.filter((driver) => normalizeSearchText(driver.status) === "active").length} active / {visibleDrivers.length} total
          </span>
        </div>

        <div style={tableWrapStyle}>
          <table aria-label="Driver list" style={tableStyle}>
            <colgroup>
              <col style={{ width: "40px" }} />
              <col style={{ width: "14.4%" }} />
              <col style={{ width: "40px" }} />
              <col style={{ width: "250px" }} />
              <col style={{ width: "96px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "110px" }} />
              <col style={{ width: "110px" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" style={checkboxHeaderCellStyle}>
                  <input
                    type="checkbox"
                    aria-label="Select all visible drivers"
                    checked={allVisibleDriversChecked}
                    disabled={selectableDriverRows.length === 0}
                    onChange={toggleAllVisibleDriverChecks}
                  />
                </th>
                <th style={tableHeaderCellStyle}>Driver</th>
                <th aria-label="Edit driver name" style={editHeaderCellStyle}></th>
                <th style={tableHeaderCellStyle}>Phone</th>
                <th style={tableHeaderCellStyle}>Status</th>
                <th style={tableHeaderCellStyle}>Joined</th>
                <th style={tableHeaderCellStyle}>Assigned route</th>
                <th style={tableHeaderCellStyle}>Recent events</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrivers.length > 0 ? filteredDrivers.map((driver) => (
                <tr key={driver.id}>
                  <td style={checkboxCellStyle}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${driver.displayName} for deletion`}
                      checked={checkedDriverIdSet.has(driver.id)}
                      onChange={() => toggleDriverCheck(driver.id)}
                    />
                  </td>
                  <td style={tableCellStyle}>
                    <strong>{driver.displayName}</strong>
                  </td>
                  <td style={editCellStyle}>
                    <button
                      type="button"
                      aria-label={`Edit ${driver.displayName} name`}
                      style={editButtonStyle}
                      onClick={() => openDriverNameEditor(driver)}
                    >
                      <s-icon type="edit" size="base" color="subdued"></s-icon>
                    </button>
                  </td>
                  <td style={appAccessCellStyle}>
                    <span style={appAccessInlineStyle}>
                      <span>{driver.phone}</span>
                      {canShowDriverInviteActions(driver) && driver.inviteCode ? (
                        <>
                          <span style={inviteCodeInlineStyle}>
                            <span style={inviteCodeValueStyle}>코드 {driver.inviteCode}</span>
                          </span>
                          <button
                            type="button"
                            style={appAccessInlineButtonStyle}
                            onClick={() => regenerateInviteCode(driver.id)}
                          >
                            재생성
                          </button>
                        </>
                      ) : (
                        <>
                          {canShowDriverReloginAction(driver) ? (
                            <button
                              type="button"
                              style={appAccessInlineButtonStyle}
                              onClick={() => regenerateInviteCode(driver.id)}
                            >
                              재로그인
                            </button>
                          ) : null}
                          {canShowDriverInviteActions(driver) ? (
                            <button
                              type="button"
                              style={compactInviteButtonStyle}
                              onClick={() => regenerateInviteCode(driver.id)}
                            >
                              인증코드 생성
                            </button>
                          ) : null}
                        </>
                      )}
                    </span>
                  </td>
                  <td style={tableCellStyle}><span style={statusPillStyle}>{driver.status}</span></td>
                  <td style={tableCellStyle}>{driver.joinedAt}</td>
                  <td style={tableCellStyle}>
                    <span style={assignedRouteTextStyle}>{driver.assignedRoute.label}</span>
                  </td>
                  <td style={tableCellStyle}>{driver.recentEvents}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={8} style={emptyRowStyle}>No drivers match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingDriver ? (
        <div style={modalBackdropStyle} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Edit driver name" style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>Edit driver</h2>
              <button type="button" aria-label="Close edit driver" style={closeButtonStyle} onClick={closeDriverNameEditor}>×</button>
            </div>
            <div style={modalBodyStyle}>
              <label style={fieldLabelStyle} htmlFor="driver-display-name">
                Driver name
                <input
                  id="driver-display-name"
                  maxLength={80}
                  style={driverNameInputStyle}
                  type="text"
                  value={editingDriverName}
                  onChange={(event) => {
                    setEditingDriverName(event.currentTarget.value);
                    setDriverNameError("");
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveDriverName();
                  }}
                />
              </label>
              {driverNameError ? <p style={modalHelpStyle} role="alert">{driverNameError}</p> : null}
            </div>
            <div style={modalFooterStyle}>
              <button type="button" style={secondaryButtonStyle} onClick={closeDriverNameEditor}>Cancel</button>
              <button
                type="button"
                style={editingDriverName.trim() && driverUpdateFetcher.state === "idle" ? primaryButtonStyle : disabledActionButtonStyle}
                disabled={!editingDriverName.trim() || driverUpdateFetcher.state !== "idle"}
                onClick={saveDriverName}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inviteOpen ? (
        <div style={modalBackdropStyle} role="presentation">
          <div role="dialog" aria-modal="true" aria-label="Invite driver" style={modalStyle}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>Invite driver</h2>
              <button type="button" aria-label="Close invite driver" style={closeButtonStyle} onClick={() => setInviteOpen(false)}>×</button>
            </div>
            <div style={modalBodyStyle}>
              <div style={phoneFieldStyle}>
                <span style={{ color: "#303030", display: "block", fontSize: "13px", fontWeight: 700 }}>
                  Country dial code and phone number
                </span>
                <div style={phoneInputRowStyle}>
                  <button
                    type="button"
                    aria-label="Select country dial code"
                    aria-controls="driver-country-code-options"
                    aria-expanded={countryCodeOpen}
                    style={countryCodeButtonStyle}
                    onClick={() => setCountryCodeOpen((open) => !open)}
                  >
                    <span style={countryCodeButtonValueStyle}>
                      <span>{selectedCountryCode.flag}</span>
                      <span>{selectedCountryCode.dialCode}</span>
                    </span>
                    <span aria-hidden="true">⌄</span>
                  </button>
                  <input
                    aria-label="Driver phone number"
                    inputMode="tel"
                    placeholder={`${selectedCountryCode.dialCode} ${selectedCountryCode.example}`}
                    style={phoneInputStyle}
                    type="tel"
                    value={invitePhone}
                    onChange={(event) => {
                      setInvitePhone(formatInvitePhoneInput(selectedCountryCode.dialCode, event.currentTarget.value));
                      setCopyStatus("");
                    }}
                  />
                </div>
                {countryCodeOpen ? (
                  <div id="driver-country-code-options" aria-label="Country dial code options" style={countryCodeAccordionStyle}>
                    {countryDialCodeOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={option.id === selectedCountryCodeId}
                        style={option.id === selectedCountryCodeId ? selectedCountryCodeOptionButtonStyle : countryCodeOptionButtonStyle}
                        onClick={() => {
                          setSelectedCountryCodeId(option.id);
                          setInvitePhone(formatInvitePhoneInput(option.dialCode, invitePhone));
                          setCountryCodeOpen(false);
                          setCopyStatus("");
                        }}
                      >
                        <span>{option.flag}</span>
                        <span>{option.label}</span>
                        <strong>{option.dialCode}</strong>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <p style={modalHelpStyle}>
                We will keep the invite keyed by phone number. For MVP, copy the driver app download link and send it manually.
              </p>
              <div>
                <p style={modalHelpStyle}>Invite message preview</p>
                <pre style={inviteMessagePreviewStyle}>{inviteMessagePreview}</pre>
              </div>
              {copyStatus ? <p style={modalHelpStyle} role="status">{copyStatus}</p> : null}
            </div>
            <div style={modalFooterStyle}>
              <button type="button" style={secondaryButtonStyle} onClick={() => setInviteOpen(false)}>Cancel</button>
              <button type="button" style={primaryButtonStyle} onClick={savePendingDriver}>Save</button>
              <button type="button" style={secondaryButtonStyle} onClick={copyInviteMessage} disabled={!currentInviteCode}>Copy invite message</button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </PageShell>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
