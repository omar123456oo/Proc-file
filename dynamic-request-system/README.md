# Request Hub – Dynamic Request & Checklist Approval Workflow System

Frontend prototype of a configurable request, checklist and sequential approval system.
Built with HTML5, CSS3 and vanilla JavaScript (ES2020). Data is persisted in the browser's LocalStorage.
No framework, build step or server is required.

---

## 1. How to run

1. Open `index.html` in a current Chrome, Edge, Firefox or Safari browser (double-click works; `file://` is supported).
2. Sample data is seeded automatically on first load.
3. Use the **user menu in the top-right corner** to switch between demo users (roles).
   This is a demonstration mechanism only – it is **not** authentication or security.

Optional – serve over HTTP instead of `file://`:

```bash
cd dynamic-request-system
python3 -m http.server 8080   # then open http://localhost:8080
```

Reset at any time: **System Settings → Reset Demo Data**.

## 2. Automated tests

| Runner | Command / location | What it checks |
|---|---|---|
| Browser | open `tests/test-runner.html` | Scenarios 1–6 from the specification, existing PRD rules, checklist points, Time Settings and multiple approvers (105 checks) |
| Node.js | `node tests/run-node.js` | The same suite, headless (exit code 1 on failure) |

The test runner uses a separate storage namespace (`drs.test.*`) and never changes your demo data.

## 3. Demo users

| User | Department | Role(s) | Useful for |
|---|---|---|---|
| Sara Ibrahim | Administration | System Administrator, Employee | Configuration (default user) |
| Ahmed Mohamed | Operations | Employee | Submitting / resubmitting requests |
| Layla Hassan | Operations | Approver (Operations Manager) | Stage 1 of the repeated-department demo |
| Karim Saleh | Operations | Approver (Ops Assistant Manager) | Stage 2 |
| Rania Khalil | Finance | Approver (Finance Manager) | Stage 3 |
| Khaled Mansour | Operations | Approver (Operations Director) | Stage 4 |
| Tarek Fawzi / Mona Adel | Procurement / HR | Approver | Mandatory procurement hierarchies |
| Hana Fouad, Nour Samir, Amr Lotfy, Heba Said, Mariam Tamer | various | Department Execution Team | Recording execution after approval |

Full list: **Departments & Users → Users** (each row has an *Act as* button).

## 4. Sample data

* **Operations Equipment Request** – the repeated-department example. Concerned Departments: Operations, Finance.
  Workflow v2 has 4 stages: Operations/Checklist A/Ops Manager → Operations/Checklist B/Ops Assistant Manager →
  Finance/Checklist A/Finance Manager → Operations/Checklist C/Ops Director. v1 had 3 stages (versioning demo).
* **Non-Admin Procurement Request** – mandatory hierarchy Supervisor → Manager → Procurement Manager, with a Finance stage inserted.
* **Admin Procurement Request** – mandatory hierarchy Line Manager → Procurement Manager → HR Manager, plus an optional Administration stage.
* **IT System Access Request** – dynamic roles (requester's department manager, stage department manager).
* **Training Request** (Inactive) and **Legacy Purchase Requisition** (Archived).
* 8 checklist templates covering all item types.
* Requests REQ-1001 … REQ-1008 in every status: Completed (on v1), In Progress, Approved (awaiting execution), Rejected, Returned for Correction, Pending Approval, Draft.

## 5. Manual test guide (specification scenarios)

**Scenario 1 – Repeated department.** As Sara open *Request Templates → New Template*. Add Operations and Finance as Concerned
Departments (try adding Operations again: it is disabled). Add 4 stages as in the spec. Operations can be selected in three stages
without error. The summary shows "4 active stages · 2 unique departments · Operations ×3". Set Active and save → workflow v1 published.

**Scenario 2 – Sequential approval.** Switch to Karim and open REQ-1002 (Stage 2 pending). Approve (mandatory checklist items are enforced).
Stage 3 becomes Pending, Stage 4 stays Waiting. Switch to Khaled and open REQ-1002 from *Approval Workspace → Upcoming*: actions are locked
with the reason "Stage 4 is Waiting…".

**Scenario 3 – Rejection.** As the current approver click *Reject*. A comment is mandatory. The request becomes Rejected and later stages show
"Not executed – workflow stopped".

**Scenario 4 – Versioning.** Note REQ-1001 (v1, 3 stages) and REQ-1002 (v2, 4 stages) on the same template. Edit the template again
(e.g. add a stage) and save → v3. Existing requests keep their version (see *Summary → Workflow version → view*).

**Scenario 5 – Checklist independence.** In the scenario-1 template, use the same checklist in Stages 1 and 3. Each stage instance stores its own
answers; expand "Checklist answers" on each stage in Request Tracking.

**Scenario 6 – Return for correction.** As Rania (or Tarek on REQ-1005) click *Return for Correction* (comment required). Switch to the requester:
*My Requests* shows the correction banner; *Correct & Resubmit* resumes the workflow (default) or restarts it, per System Settings.
The Return decision stays in the approval history and in the stage's "earlier review cycles".

## 6. Architecture

```
dynamic-request-system/
├── index.html                 App shell (sidebar, top bar, notification & user menus)
├── assets/css/
│   ├── style.css              Design tokens, layout shell
│   ├── components.css         Buttons, cards, tables, badges, forms, modals, timeline, stage builder
│   └── responsive.css         Tablet and mobile layouts
├── assets/js/core/            Business layer – no page rendering
│   ├── storage.js             Collections in LocalStorage, safe JSON parsing, transactions, export/import
│   ├── constants.js           Statuses, events, roles, dynamic approver roles, mandatory hierarchies
│   ├── validation.js          Pure validation rules (template, stage, checklist, request, answers, users)
│   ├── auth.js                Demo identity, admin guard, management chain helpers
│   ├── workflow-engine.js     Submission, stage instances, approve/reject/return/skip/resubmit, execution
│   ├── template-service.js    Templates, workflow versions, checklists, departments, users
│   ├── data.js                Seed data created through the services and engine
│   ├── ui.js                  Rendering helpers: toasts, modals, badges, formatting
│   └── router.js              Hash router with unsaved-changes guard
├── assets/js/modules/         One file per screen
│   ├── dashboard.js  templates.js  checklist.js  requests.js  approvals.js
│   └── tracking.js   history.js    organization.js  settings.js
├── assets/js/app.js           Bootstrap, navigation, routes
└── tests/                     scenarios.js, test-runner.html, run-node.js
```

The project uses plain `<script>` files instead of ES modules so that it opens directly from the file system.
All modules hang off one namespace object, `window.DRS`.

### LocalStorage collections (`drs.v1.*`)

`departments`, `users`, `checklistTemplates`, `requestTemplates`, `workflowVersions`, `requests`, `stageInstances`,
`decisions`, `history`, `notifications`, plus `settings` (current demo user, request counter, workflow options).
Each key maps to a future MongoDB collection. Engine operations run inside `Store.transaction()`, which rolls every collection back if a rule fails.

### Key data model decisions

* **Concerned Departments** are an array of unique department ids on the template. They are separate from stages.
  After final approval, one execution task is created per concerned department.
* **Stages** are ordered records. Stage count = number of active stage records, never the number of unique departments.
* **Workflow versions** are immutable snapshots of the stage list, concerned departments and checklist items.
  A version is created only when the workflow fingerprint changes and the configuration is complete.
  Editing a checklist republishes complete templates that use it.
* **Stage instances** (`<requestId>-S<n>`) copy everything at submission: department, resolved approver, level, checklist items.
  Answers, status, comment and review cycles live on the instance, so repeated departments and shared checklists never mix.

## 7. Workflow rules

| Rule | Where enforced |
|---|---|
| Sequential stages; only the active stage can be processed; next = exactly order + 1 | `WorkflowEngine.canAct`, `closeStageAndAdvance` |
| Only the assigned approver of the active stage can act | `canAct` |
| Reject / Return / Skip need a comment | `Validation.decisionComment` |
| Mandatory checklist items before Approve | `Validation.answers` |
| Rejection stops the workflow; later stages stay Waiting and cannot be acted on | `reject` |
| No self-approval; a subordinate cannot approve a manager's request | Escalation at submission, re-checked in `canAct` |
| Admin and Non-Admin procurement hierarchies are mandatory and locked | `Validation.template` (presence, order, role, active, mandatory) |
| One Owner Department; unique Concerned Departments; Active ⇒ ≥1 concerned dept and complete workflow | `Validation.template` |
| Inactive or archived templates cannot receive requests | `getUsableTemplate` |
| Configuration is admin-only | `Auth.requireAdmin` in every TemplateService write |
| Historical requests are unchanged by configuration changes; templates with requests cannot be deleted | Versions and snapshots; `TemplateService.remove` |

**Approver conflicts.** When a configured approver is the requester, or reports to the requester, the stage is reassigned at submission
to the requester's nearest eligible manager. The reassignment is recorded on the stage and in the history.

**Return for Correction.** The request becomes *Returned for Correction* and only the requester can resubmit it. The behaviour is set in System Settings
and captured when the request is returned:

* *Resume* (default): the returning stage is reactivated in a new review cycle; earlier approvals stand.
* *Restart*: every stage returns to Waiting and Stage 1 is reactivated.

In both cases the original workflow version is kept and every previous decision remains in the decision log.

**Request statuses.** Draft → Pending Approval (no stage approved yet) → In Progress → Approved (all stages approved) → Completed
(all concerned departments recorded execution). Side exits: Returned for Correction, Rejected.
**Skipped** is used only for optional stages and only when enabled in System Settings (off by default).

## 7b. Checklists, points and Time Settings

**Checklist** (Checklist Configuration) – belongs to exactly one department and has:

* **Need Approval First** – on: the stage approver Approves / Returns / Rejects. Off: the assigned person only clicks
  *Complete Checklist* (decision recorded as *Completed*); Return for Correction stays available.
* **Time Settings** – *Estimation Time* + *Duration Type* (`Hour` or `Day (N Hours)`). Day-based estimates follow the
  working-day length, so changing 8 → 7 hours per day updates them.
* **Points** – each point is *Required* or *Optional*, and can be:
  * **Need Attached** – a file must be attached to the point (required points always; optional points when answered).
  * **Link to Action** – the stage cannot be approved until the point is answered (`Yes` for Yes/No points);
    otherwise the approver must Return or Reject.
  * Answer type: Yes/No (default), Text, Number, Date, Dropdown, Attachment.

**Link to approval cycle** – from the checklist list (*Link*) or editor. It adds a stage for the checklist's department to the chosen
request template, at any position, with its own approver. The same checklist or department can be linked again; every link is an
independent stage. Each link publishes a new workflow version.

**Time Settings** (System Settings) – working hours per day (default 8), working days (default Sunday–Thursday) and day start (09:00).
They drive:

* the **Time Plan** card in the Template Builder: total time and the share of each department across all its stages;
* stage **due dates** and **Overdue** badges in the Approval Workspace, the stage screen and Request Tracking;
* the **estimated time / expected completion** shown before submission and on Request Tracking.

**Multiple approvers per stage** – in the Stage form, *Add approver* assigns more people (specific users or dynamic roles) to the
same checklist stage, and *Approval Rule* decides how they act:

| Rule | Behaviour |
|---|---|
| Any one approves | The first approval by any assigned approver completes the stage; the others no longer need to act. |
| All must approve | Each approver's approval is recorded ("Stage Approval Recorded"); the stage completes when everyone approved. Any of them can still Return or Reject. |
| No approval needed | Assigned people only *Complete Checklist*. A stage with this rule and no checklist completes automatically when reached. |

Self-approval and subordinate rules apply to every approver. Mandatory hierarchy stages keep one approver with "Any one approves".

## 8. Known limitations

* The user switcher is not authentication. Rules run in the browser and can be bypassed with developer tools.
* Attachments store file name, size and type only; no file content is uploaded.
* Data lives in one browser profile (about 5 MB LocalStorage limit). Use Export/Import to move it.
* No delegation, out-of-office, automatic escalation on overdue stages, parallel stages or conditional routing.
* Due dates ignore public holidays.
* When two consecutive stages resolve to the same approver, both stages are kept; they are not merged.
* Draft requests resolve their workflow version at submission time, not when the draft was created.
* Configuration changes (templates, users) are versioned or validated but have no separate audit log; request events are fully audited.

## 9. Backend integration recommendations (Node.js + MongoDB)

1. Replace `storage.js` with an API client that keeps the same method names, then make engine calls asynchronous.
2. Move `validation.js`, `workflow-engine.js` and `template-service.js` to the server unchanged in logic. The browser copies become UX-only checks.
3. Suggested endpoints: `POST /requests`, `POST /requests/:id/stages/:stageId/{approve|reject|return|skip}`, `POST /requests/:id/resubmit`,
   `POST /templates/:id/versions`, `GET /approvals/pending`.
4. Use MongoDB multi-document transactions where `Store.transaction` is used today. Add an optimistic-lock field (`version` or `updatedAt`)
   on requests to stop two approvers acting on the same stage at the same time.
5. Indexes: `stageInstances {approverId, status}`, `stageInstances {requestId, order}` (unique), `history {requestId, timestamp}`,
   `requests {requesterId, status}`, `workflowVersions {templateId, versionNumber}` (unique).
6. Replace the demo switcher with SSO/JWT; read the actor id from the token, never from the request body.
7. Store attachments in object storage (S3 / Azure Blob) and keep only metadata in MongoDB.
8. Send notifications by email or Teams through a queue instead of the `notifications` collection only.
