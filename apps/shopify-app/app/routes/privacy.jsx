/* eslint-disable react/prop-types */
const CONTACT_EMAIL = "hdgim1240@gmail.com";
const LAST_UPDATED = "2026-05-15";

const collectedItemsKo = [
  "Shopify 스토어 설치와 인증에 필요한 스토어 정보",
  "배송 경로 계획에 필요한 주문 번호, 주문 식별자, 상품명과 수량, 결제/처리 상태, 배송일과 배송 지역 같은 주문 속성",
  "수령자 이름, 배송 주소, 배송 전화번호, 사용 가능한 경우 배송 좌표",
  "판매자가 입력하거나 저장한 출발지 주소와 좌표, 경로 계획, 정차 순서, 배송원 표시명, 배송원 전화번호, 배송원 배정 상태",
  "서비스 보안과 운영에 필요한 webhook 메타데이터, 로그, 타임스탬프, 인증 및 세션 기록",
];

const collectedItemsEn = [
  "Shopify store information required to install and authenticate the app",
  "Order identifiers, order numbers, line item names and quantities, payment and fulfillment status labels, delivery dates, and delivery areas used for route planning",
  "Recipient name, shipping address, shipping phone number, and shipping coordinates when available",
  "Merchant-entered departure addresses and coordinates, route plans, stop sequences, driver display names, driver phone numbers, and driver assignment status",
  "Webhook metadata, logs, timestamps, authentication records, and session records needed to operate and secure the service",
];

const useItemsKo = [
  "Shopify 주문을 로컬 배송 경로 계획 화면에 표시하기 위해 사용합니다.",
  "주문을 배송일과 배송 지역별 경로 초안으로 만들고 정차 순서를 관리하기 위해 사용합니다.",
  "지도에서 출발지, 배송 정차 지점, 경로 선을 표시하기 위해 사용합니다.",
  "배송원을 경로에 배정하고 배송 운영을 지원하기 위해 사용합니다.",
  "보안 유지, 장애 대응, Shopify webhook 검증, 법령 및 Shopify 요구사항 준수를 위해 사용합니다.",
];

const useItemsEn = [
  "To display Shopify orders that are ready for local delivery planning",
  "To create route drafts by delivery date and delivery area and manage stop sequences",
  "To show departure locations, delivery stops, and route lines on maps",
  "To assign drivers to routes and support delivery operations",
  "To maintain security, troubleshoot issues, verify Shopify webhooks, and comply with legal and Shopify requirements",
];

const processorItemsKo = [
  "Shopify API를 사용해 판매자 인증과 최소한의 주문 및 위치 데이터를 처리합니다.",
  "앱과 배송 API 서버는 Amazon Web Services 인프라에서 호스팅됩니다.",
  "지도 타일은 판매자 브라우저에서 OpenFreeMap, OpenMapTiles, Overture Maps 관련 인프라를 통해 로드될 수 있습니다.",
  "출발지와 배송지 주소의 좌표 확인에는 설정된 geocoding 제공자가 사용될 수 있습니다.",
  "경로 선 계산에는 설정된 OSRM routing endpoint가 사용될 수 있습니다.",
];

const processorItemsEn = [
  "Shopify APIs are used for merchant authentication and the minimum order and location data required by the app.",
  "The app and delivery API server are hosted on Amazon Web Services infrastructure.",
  "Map tiles may be loaded in the merchant's browser from OpenFreeMap, OpenMapTiles, and Overture Maps infrastructure.",
  "A configured geocoding provider may be used to resolve departure and delivery addresses into coordinates.",
  "A configured OSRM routing endpoint may be used to calculate route geometry.",
];

const rightsItemsKo = [
  "판매자는 운영자에게 개인정보 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다.",
  "Shopify가 고객 데이터 열람 또는 삭제 요청 webhook을 보내면 Clever는 webhook 서명을 검증한 뒤 필요한 조치를 진행합니다.",
  "검증된 customers/redact webhook은 해당 Shopify 주문 식별자와 연결된 로컬 주문 기록 삭제에 사용됩니다.",
  "검증된 shop/redact webhook은 해당 스토어와 연결된 로컬 배송 운영 데이터 삭제에 사용됩니다.",
];

const rightsItemsEn = [
  "Merchants can request access, correction, deletion, or restriction of personal data by contacting the operator.",
  "When Shopify sends customer data access or deletion webhooks, Clever verifies the webhook signature before taking required action.",
  "Verified customers/redact webhooks are used to delete matching locally stored Shopify order records.",
  "Verified shop/redact webhooks are used to delete locally stored delivery operations data associated with the shop.",
];

export const meta = () => [
  { title: "Clever Privacy Policy" },
  {
    name: "description",
    content:
      "Privacy policy for Clever, a Shopify embedded app for local delivery route planning.",
  },
];

export default function PrivacyPolicy() {
  return (
    <main style={pageStyle}>
      <div style={containerStyle}>
        <section style={heroStyle}>
          <p style={eyebrowStyle}>최종 업데이트: {LAST_UPDATED}</p>
          <h1 style={titleStyle}>Clever 개인정보 처리방침</h1>
          <p style={leadStyle}>
            Clever는 Shopify 주문을 로컬 배송 경로 계획으로 전환하는 내장 앱입니다.
            운영자는 서비스 제공에 필요한 범위 안에서만 주문, 배송, 경로, 배송원
            배정 데이터를 처리합니다.
          </p>
          <p style={leadStyle}>
            Clever is an embedded Shopify Admin app for local delivery route
            planning. The operator processes order, delivery, route, and driver
            assignment data only as needed to provide and secure the service.
          </p>
        </section>

        <PolicySection title="1. 처리하는 정보 / Information we process">
          <TwoColumnList korean={collectedItemsKo} english={collectedItemsEn} />
        </PolicySection>

        <PolicySection title="2. 이용 목적 / How we use information">
          <TwoColumnList korean={useItemsKo} english={useItemsEn} />
        </PolicySection>

        <PolicySection title="3. 처리 위탁 및 외부 서비스 / Processors and external services">
          <TwoColumnList korean={processorItemsKo} english={processorItemsEn} />
          <p style={paragraphStyle}>
            Clever는 현재 판매자 주문을 읽고 배송 경로를 준비하는 데 필요한 최소
            Shopify API 범위만 요청합니다. 고객 이메일, 결제 정보, 고객 프로필
            전체 접근 권한은 현재 릴리스에서 요청하지 않습니다.
          </p>
        </PolicySection>

        <PolicySection title="4. 보관 기간 / Retention">
          <p style={paragraphStyle}>
            운영자는 서비스 제공, 배송 운영, 보안, 장애 대응, 정산 또는 운영 검증,
            법령상 보관 의무에 필요한 기간 동안 정보를 보관합니다. 목적이 종료되거나
            삭제 요청을 처리할 수 있는 경우에는 관련 데이터를 삭제하거나 식별할 수
            없도록 처리합니다.
          </p>
          <p style={paragraphStyle}>
            The operator retains order, route, driver, and operational records
            only for as long as needed to provide the service, support delivery
            operations, maintain security, troubleshoot issues, verify operations,
            or meet legal obligations. When the purpose ends or a deletion request
            can be fulfilled, the related data is deleted or de-identified.
          </p>
        </PolicySection>

        <PolicySection title="5. 판매자 및 고객 데이터 권리 / Data rights and deletion">
          <TwoColumnList korean={rightsItemsKo} english={rightsItemsEn} />
        </PolicySection>

        <PolicySection title="6. 위치 및 지도 데이터 / Location and map data">
          <p style={paragraphStyle}>
            Clever는 배송 경로 계획을 위해 판매자가 설정한 출발지와 Shopify 주문의
            배송지 주소 또는 좌표를 사용할 수 있습니다. 이 앱은 배송원 또는 구매자의
            실시간 위치를 백그라운드에서 추적하는 용도로 설계되어 있지 않습니다.
          </p>
          <p style={paragraphStyle}>
            Clever may use merchant-configured departure locations and shipping
            addresses or coordinates from Shopify orders to prepare delivery
            routes. The app is not designed to track a driver&apos;s or buyer&apos;s
            real-time background location.
          </p>
        </PolicySection>

        <PolicySection title="7. 보안 / Security">
          <p style={paragraphStyle}>
            운영자는 HTTPS, Shopify OAuth 및 session token 인증, Shopify webhook
            HMAC 검증, 데이터베이스 접근 통제, 최소 권한 API scope를 사용해 서비스를
            보호합니다. 보호된 고객 데이터 접근은 서비스 운영과 지원에 필요한 인원과
            시스템으로 제한됩니다.
          </p>
          <p style={paragraphStyle}>
            The operator protects the service with HTTPS, Shopify OAuth and
            session-token authentication, Shopify webhook HMAC verification,
            database access controls, and least-privilege API scopes. Access to
            protected customer data is limited to personnel and systems that need
            it to operate or support the service.
          </p>
        </PolicySection>

        <PolicySection title="8. 문의 및 삭제 요청 / Contact and deletion requests">
          <p style={paragraphStyle}>
            개인정보 문의, 지원 요청, 계정 또는 데이터 삭제 요청은 아래 이메일로 보내
            주세요. 요청 시 스토어명, 연락 가능한 이메일, 요청 내용을 함께 제공하면
            확인에 도움이 됩니다.
          </p>
          <p style={paragraphStyle}>
            For privacy requests, support requests, or account and data deletion
            requests, contact the email below. Include the store name, a reachable
            email address, and a description of the request so that the operator
            can verify and process it.
          </p>
          <p style={contactStyle}>
            Email: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </PolicySection>

        <section style={footerStyle}>
          <p style={paragraphStyle}>
            공개 URL: <a href="/privacy">/privacy</a>
          </p>
          <p style={mutedStyle}>
            This page is provided for Shopify merchants and app reviewers to
            understand how Clever processes data for local delivery route
            planning.
          </p>
        </section>
      </div>
    </main>
  );
}

function PolicySection({ title, children }) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  );
}

function TwoColumnList({ korean, english }) {
  return (
    <div style={gridStyle}>
      <div>
        <h3 style={subheadingStyle}>한국어</h3>
        <ul style={listStyle}>
          {korean.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <h3 style={subheadingStyle}>English</h3>
        <ul style={listStyle}>
          {english.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  margin: 0,
  background: "#f6f6f7",
  color: "#1f2933",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const containerStyle = {
  width: "min(100% - 32px, 1040px)",
  margin: "0 auto",
  padding: "48px 0",
};

const heroStyle = {
  padding: "32px",
  border: "1px solid #e3e3e3",
  borderRadius: "18px",
  background: "#ffffff",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
};

const eyebrowStyle = {
  margin: "0 0 8px",
  color: "#5c6ac4",
  fontSize: "14px",
  fontWeight: 700,
};

const titleStyle = {
  margin: 0,
  fontSize: "clamp(30px, 4vw, 44px)",
  lineHeight: 1.15,
  letterSpacing: "-0.03em",
};

const leadStyle = {
  margin: "18px 0 0",
  maxWidth: "820px",
  color: "#4b5563",
  fontSize: "17px",
  lineHeight: 1.75,
};

const sectionStyle = {
  marginTop: "24px",
  padding: "28px",
  border: "1px solid #e3e3e3",
  borderRadius: "16px",
  background: "#ffffff",
};

const sectionTitleStyle = {
  margin: 0,
  fontSize: "22px",
  lineHeight: 1.35,
};

const sectionBodyStyle = {
  marginTop: "18px",
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: "22px",
};

const subheadingStyle = {
  margin: "0 0 10px",
  color: "#374151",
  fontSize: "15px",
  fontWeight: 700,
};

const listStyle = {
  margin: 0,
  paddingLeft: "20px",
  color: "#4b5563",
  lineHeight: 1.75,
};

const paragraphStyle = {
  margin: "0 0 14px",
  color: "#4b5563",
  lineHeight: 1.75,
};

const contactStyle = {
  margin: "16px 0 0",
  color: "#111827",
  fontWeight: 700,
};

const footerStyle = {
  marginTop: "24px",
  padding: "24px 28px",
  borderRadius: "16px",
  background: "#111827",
  color: "#ffffff",
};

const mutedStyle = {
  margin: 0,
  color: "#d1d5db",
  lineHeight: 1.7,
};
