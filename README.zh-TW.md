# TanE03 Health Monitoring (健康監測)

[English Version](README.md)

這是一個使用 Node.js、Express 和 TypeScript 建構的後端服務，用於處理長期健康指標（心率變異性 HRV、靜息心率 RHR、睡眠分數及睡眠時長）。此專案設計為可以在本地進行開發，並透過 Docker 容器化後部署至 AWS Lambda。

## 必備軟體

在開始之前，請確保您已安裝以下軟體：

- **Node.js**（建議使用 v18 或更高版本）
- **npm**（隨附於 Node.js）
- **Docker**（用於建構生產環境的容器映像檔）
- **AWS CLI**（用於在本地設定 AWS 憑證，以及與 DynamoDB / Lambda / EventBridge 進行互動）
- **AWS IAM user** 具有存取 DynamoDB、Lambda 和 EventBridge 的權限

---

## 專案設定

請按照以下步驟在本地端執行專案：

### 1. 複製 (Clone) 儲存庫

```bash
git clone https://github.com/renllan/tane03-Health-Monitoring.git
cd tane03_long_term_health_monitoring
```

### 2. 安裝依賴套件

安裝所有需要的 Node.js 套件（包含 TypeScript 與 AWS SDKs）：

```bash
npm install
```

### 3. 環境變數

在專案根目錄建立一個 `.env` 檔案。您需要設定 AWS 相關參數與資料表名稱。

`.env` 範例：

```env
AWS_REGION=ap-northeast-1
HEALTH_MONITORING_LAMBDA_ARN=arn:aws:lambda:ap-northeast-1:<ACCOUNT_ID>:function:tane03-long-term-health-monitoring
SCHEDULER_ROLE_ARN=arn:aws:iam::<ACCOUNT_ID>:role/SchedulerRole
BASE_URL=http://localhost:3000
# 在此加入您的 DynamoDB 資料表名稱
```

### 4. 編譯專案

由於此專案使用 TypeScript，您必須在執行前將其編譯為 JavaScript：

```bash
npx tsc
```

*這將產生一個包含已編譯 JavaScript 的 `dist/` 目錄。*

### 5. 在本地端執行

若要在本地端使用 Express 測試 API 路由：

```bash
npm start
```

*伺服器將會啟動（預設埠號為 3000）。*

### 6. 在本地端建構並執行 Docker 容器

若要在本地機器上測試或除錯容器化環境，最簡單的方式是使用 Docker Compose。它將會自動使用多階段 Dockerfile 進行建構，並將您的 `.env` 變數映射到 Lambda 模擬器中：

```bash
docker compose up lambda --build
```

建議使用建構 Docker 容器的方式來進行測試，而非使用 `npm start`。因為容器的環境最接近實際的 AWS Lambda 環境。

當容器在您的機器上運行後，您可以使用 `curl` 發送模擬的 JSON 負載來觸發本地 Lambda 模擬器：

```bash
curl -X POST "http://localhost:9000/2015-03-31/functions/function/invocations" -d '{"path": "/api/evaluation/12345", "httpMethod": "GET"}'
```

---

## CI/CD 流程 (自動化部署)

本儲存庫使用 **GitHub Actions** 來進行持續整合與持續部署 (CI/CD)。

每當程式碼被合併 (merge) 到 `main` 分支時，GitHub Actions 流程將會自動：

1. 檢出最新的程式碼。
2. 安全地設定 AWS 憑證。
3. 使用 `docker/Dockerfile` 建構 Docker 映像檔。
4. 將新映像檔推送到 AWS ECR。
5. 觸發 AWS Lambda 函數的更新，立即部署最新版本。

這代表您只需要在除錯或從本地分支部署時執行手動的 Docker 步驟。生產環境的部署會在合併時自動進行！

---

## 專案架構：四層式架構

此應用程式嚴格遵循 **四層式架構** (4-Layer Architecture)。此架構可以將職責分離，使程式碼具備高維護性、可擴展性及易於測試的特性。

### 1. 路由層 Router Layer (`router/`)

**用途：** 將 HTTP 請求 (GET, POST 等) 及 URL 對應至正確的控制器。

- **功能：** 扮演交通警察的角色。它定義了像 `/api/evaluate/:imei` 這樣的路徑，並將收到的請求轉發至控制器層中對應的函數。它也可以套用中介軟體 (如身分驗證 Authentication)。
- **規則：** 此層不應包含任何業務邏輯或資料操作。

### 2. 控制器層 Controller Layer (`controller/`)

**用途：** 處理 HTTP 請求與回應的生命週期。

- **功能：** 從請求中擷取參數 (`req.params`, `req.body`)，進行簡單的驗證，並傳遞給服務層。當服務層完成工作後，控制器會格式化回應內容並將其發送回客戶端 (`res.status(200).json(...)`)。
- **規則：** 控制器不應直接查詢資料庫或計算健康指標。

### 3. 服務層 Service Layer (`service/`)

**用途：** 包含核心的 **業務邏輯**。

- **功能：** 這是實際執行工作的地方。它計算滑動窗口 (sliding windows)、評估健康指標 (如 RMSSD、睡眠分數)、整合第三方 API (如 AAASWatch)，並決定應用程式的商業規則。
- **規則：** 它不應知道任何關於 HTTP 請求 (`req` 或 `res`) 的事情。如果它需要資料，必須向儲存庫層請求。

### 4. 儲存庫層 Repository Layer (`repository/`)

**用途：** 處理所有資料庫與資料存取邏輯。

- **功能：** 嚴格負責與 DynamoDB (或任何其他資料庫) 的通訊。它負責執行 `query`、`scan`、`putItem` 及 `updateItem` 命命。
- **規則：** 將 AWS SDK 命令保留於此，應用程式的其餘部分就不需要知道資料是*如何*儲存的。如果您未來從 DynamoDB 切換到 Postgres，您只需要重寫儲存庫層即可！
