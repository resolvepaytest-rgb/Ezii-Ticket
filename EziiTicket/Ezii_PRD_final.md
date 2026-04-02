EZII Ticketing System  |  Product Requirements Document  v1.0

**EZII**

Internal Ticketing System

|**Product Requirements Document**|
| :-: |

*Version 1.0  |  March 2026  |  Confidential*



|**Document Information**||
| :- | :- |
|**Product**|Ezii Ticketing System (ETS)|
|**Author**|Product Team|
|**Status**|Draft — For Internal Review|
|**Date**|March 16, 2026|
|**Version**|1\.0|
|**Products**|Payroll  |  Leave  |  Attendance  |  Expense|


# <a name="_toc225254527"></a>**Table of Contents**

[Table of Contents	2](#_toc225254527)

[1. Overview	6](#_toc225254528)

[1.1 Purpose	6](#_toc225254529)

[1.2 Problems Being Solved	6](#_toc225254530)

[1.3 Goals	6](#_toc225254531)

[1.4 Success Metrics	7](#_toc225254532)

[1.5 Scope Summary	7](#_toc225254533)

[2. User Personas	8](#_toc225254534)

[2.1 Customer (End User)	8](#_toc225254535)

[2.2 L1 Support Agent	8](#_toc225254536)

[2.3 L2 Product Specialist	8](#_toc225254537)

[2.4 Support Team Lead	9](#_toc225254538)

[2.5 System Administrator	9](#_toc225254539)

[3. System Setup & Configuration	10](#_toc225254540)

[3.1 Organisation & Product Setup	10](#_toc225254541)

[3.1.1 Organisation Profile	10](#_toc225254542)

[3.1.2 Product Enablement	10](#_toc225254543)

[3.2 Ticket Category Configuration	10](#_toc225254544)

[3.2.1 Payroll — Default Categories	10](#_toc225254545)

[3.2.2 Leave — Default Categories	11](#_toc225254546)

[3.2.3 Attendance — Default Categories	11](#_toc225254547)

[3.2.4 Expense — Default Categories	11](#_toc225254548)

[3.3 SLA Policy Engine	12](#_toc225254549)

[3.3.1 Tier 1 — Customer-Facing SLA (Configurable)	12](#_toc225254550)

[3.3.2 Tier 2 — Internal Ezii SLA (Non-Configurable)	13](#_toc225254551)

[3.3.3 Customer Admin SLA Configuration Bounds	13](#_toc225254552)

[3.3.4 SLA Calculation Rules	14](#_toc225254553)

[3.3.5 Keyword Auto-Escalation	14](#_toc225254554)

[3.4 Routing & Assignment Rules	14](#_toc225254555)

[3.4.1 Rule Conditions	15](#_toc225254556)

[3.4.2 Rule Actions	15](#_toc225254557)

[3.5 User & Role Management	15](#_toc225254558)

[3.6 Notification Templates	15](#_toc225254559)

[4. Workflow Configuration	17](#_toc225254560)

[4.1 Ticket State Machine	17](#_toc225254561)

[4.1.1 Open vs. Pending — The Key Distinction	17](#_toc225254562)

[4.1.2 Reopened State	18](#_toc225254563)

[4.2 Sequential Workflow Model	18](#_toc225254564)

[4.2.1 Workflow Sequence Structure	19](#_toc225254565)

[4.2.2 Auto-Assignment Model	19](#_toc225254566)

[4.2.3 Default Workflow Sequences	19](#_toc225254567)

[4.2.4 Creating a Custom Sequence (Admin Panel)	20](#_toc225254568)

[4.3 Stage Gates	20](#_toc225254569)

[4.4 SLA-Triggered Automatic Actions	20](#_toc225254570)

[4.5 Workflow Audit Trail	21](#_toc225254571)

[4.6 v2.0 — Planned Enhancements	21](#_toc225254572)

[5. Chat Widget — In-App Ticket Creation	23](#_toc225254573)

[4.1 Widget Availability & Placement	23](#_toc225254574)

[4.2 Widget States	23](#_toc225254575)

[4.3 New Ticket Creation Flow	24](#_toc225254576)

[4.3.1 Step-by-Step Flow	24](#_toc225254577)

[4.3.2 Field Behaviour in the Widget	24](#_toc225254578)

[4.3.3 Draft Persistence	25](#_toc225254579)

[4.4 Viewing & Updating Tickets in the Widget	25](#_toc225254580)

[4.4.1 My Tickets List	25](#_toc225254581)

[4.4.2 Ticket Detail in Widget	25](#_toc225254582)

[4.5 Widget — Technical & UX Specifications	26](#_toc225254583)

[4.5.1 Rendering	26](#_toc225254584)

[4.5.2 Performance	26](#_toc225254585)

[4.5.3 Accessibility	26](#_toc225254586)

[4.5.4 Context Passing	26](#_toc225254587)

[4.6 Widget Behaviour by Role	27](#_toc225254588)

[4.7 Widget Configuration (Admin)	27](#_toc225254589)

[6. Employee & Customer Processes	28](#_toc225254590)

[5.1 Ticket Creation Channels	28](#_toc225254591)

[5.2 Self-Service Portal	29](#_toc225254592)

[5.2.1 Authentication	29](#_toc225254593)

[5.2.2 Portal Home	29](#_toc225254594)

[5.3 Ticket Fields Reference	29](#_toc225254595)

[5.4 Tracking a Ticket	29](#_toc225254596)

[5.4.1 Ticket List View	29](#_toc225254597)

[5.4.2 Ticket Detail View (Customer)	29](#_toc225254598)

[5.5 Notifications & Communication	30](#_toc225254599)

[5.6 Resolution & CSAT Survey	30](#_toc225254600)

[7. Agent Processes	31](#_toc225254601)

[7.1 Ticket Lifecycle	31](#_toc225254602)

[7.2 Agent Workspace	31](#_toc225254603)

[5.2.1 Queue Views	31](#_toc225254604)

[5.2.2 List View Controls	32](#_toc225254605)

[7.3 Working a Ticket	32](#_toc225254606)

[5.3.1 Ticket Detail View (Agent)	32](#_toc225254607)

[5.3.2 Replying to a Customer	32](#_toc225254608)

[7.4 Escalation Workflows	32](#_toc225254609)

[5.4.1 Support Tier Model	32](#_toc225254610)

[5.4.2 Escalation Triggers	33](#_toc225254611)

[5.4.3 Escalation Handoff Standard	33](#_toc225254612)

[8. Admin Processes	34](#_toc225254613)

[8.1 Admin Panel Overview	34](#_toc225254614)

[7.2 User Lifecycle Management	34](#_toc225254615)

[6.2.1 Onboarding an Agent	34](#_toc225254616)

[6.2.2 Offboarding an Agent	35](#_toc225254617)

[6.2.3 Managing Customer Org Admins	35](#_toc225254618)

[8.3 Queue & Workload Management	35](#_toc225254619)

[8.4 Custom Fields	35](#_toc225254620)

[8.5 Audit & Compliance	35](#_toc225254621)

[6.5.1 Ticket Audit Trail	36](#_toc225254622)

[6.5.2 Admin Audit Log	36](#_toc225254623)

[6.5.3 Data Retention & Deletion	36](#_toc225254624)

[9. Notifications & Communications	37](#_toc225254625)

[9.1 Notification Matrix	37](#_toc225254626)

[9.2 Email-to-Ticket	37](#_toc225254627)

[9.3 Notification Preferences	38](#_toc225254628)

[10. Dashboards	39](#_toc225254629)

[10.1 Agent Dashboard	39](#_toc225254630)

[10.2 Team Lead Dashboard	39](#_toc225254631)

[10.3 Management / Executive Dashboard	40](#_toc225254632)

[10.4 Customer Dashboard (Portal Home)	40](#_toc225254633)

[11. Reports	41](#_toc225254634)

[11.1 Standard Reports	41](#_toc225254635)

[9.1.1 Daily Operations Digest	41](#_toc225254636)

[9.1.2 Weekly Performance Summary	41](#_toc225254637)

[9.1.3 Monthly Executive Report	41](#_toc225254638)

[9.1.4 SLA Compliance Report	42](#_toc225254639)

[9.1.5 Agent Performance Report	42](#_toc225254640)

[11.2 Custom Report Builder	42](#_toc225254641)

[11.3 Data Access & Permissions	42](#_toc225254642)

[12. Non-Functional Requirements	44](#_toc225254643)

[12.1 Performance	44](#_toc225254644)

[12.2 Scalability	44](#_toc225254645)

[12.3 Availability & Reliability	44](#_toc225254646)

[12.4 Security	44](#_toc225254647)

[12.5 Compliance	45](#_toc225254648)

[12.6 Accessibility	45](#_toc225254649)

[13. Implementation Roadmap	46](#_toc225254650)

[13.1 Phase 1 — Foundation (Months 1–2)	46](#_toc225254651)

[13.2 Phase 2 — SLA & Escalation (Month 3)	46](#_toc225254652)

[13.3 Phase 3 — Self-Service Portal (Month 4)	47](#_toc225254653)

[13.4 Phase 4 — Reporting & Analytics (Months 5–6)	47](#_toc225254654)

[13.5 Phase 5 — Advanced Capabilities (Month 7+)	47](#_toc225254655)

[14. Risks & Open Questions	48](#_toc225254656)

[14.1 Risk Register	48](#_toc225254657)

[14.2 Open Questions	48](#_toc225254658)

[15. Glossary	50](#_toc225254659)





|<p>**CHAPTER 1**</p><p>**Overview**</p>|
| :- |

# <a name="_toc225254528"></a>**1. Overview**

## <a name="_toc225254529"></a>**1.1 Purpose**
Ezii is a modern HR and workforce management platform with four core product lines: Payroll, Leave, Attendance, and Expense. As the platform and its customer base grow, support and issue management has become fragmented — teams rely on a patchwork of emails, spreadsheets, and informal messaging to handle customer requests.

The Ezii Ticketing System (ETS) is a purpose-built, ServiceNow-inspired issue management platform designed for Ezii's operational teams and customers. It provides a single place to raise, track, triage, and resolve issues across all four product lines — with consistent SLAs, structured escalation, and actionable reporting.

## <a name="_toc225254530"></a>**1.2 Problems Being Solved**

|**Problem**|**Current State**|**With ETS**|
| :- | :- | :- |
|No unified inbox|Requests arrive via email, WhatsApp, Slack — siloed per team|Single portal and agent workspace across all products|
|No SLA enforcement|Response times are unmeasured and inconsistent|Automated SLA timers, breach alerts, and escalation|
|No self-service|Every query requires an agent; high L1 volume|Customer portal to raise, track, and manage tickets without calling support|
|No cross-product visibility|Issues are handled in silos with no linked view|Shared platform with product filters and linked tickets|
|No reporting|Manual, lagged, and inaccurate data|Real-time dashboards and scheduled reports|

## <a name="_toc225254531"></a>**1.3 Goals**
1. Provide a single ticketing platform across Payroll, Leave, Attendance, and Expense.
1. Enforce SLA targets with automated escalation and breach notifications.
1. Enable customer self-service through a branded portal with ticket tracking and status updates.
1. Support a structured three-tier support model: L1 → L2 → L3.
1. Give managers real-time visibility into team performance and SLA health.

## <a name="_toc225254532"></a>**1.4 Success Metrics**

|**Metric**|**Today**|**6-Month Target**|**12-Month Target**|
| :- | :- | :- | :- |
|Avg. First Response Time|> 8 hours|< 4 hours|< 2 hours|
|SLA Breach Rate|Unmeasured|< 20%|< 10%|
|Self-service Resolution Rate|0%|15%|30%|
|Customer Satisfaction (CSAT)|Not tracked|> 3.5 / 5|> 4.2 / 5|
|Mean Time to Resolution (MTTR)|Unmeasured|< 3 business days|< 1.5 business days|
|L1 → L2 Escalation Rate|Unmeasured|< 40%|< 25%|

## <a name="_toc225254533"></a>**1.5 Scope Summary**

|<p>**In Scope — v1.0**</p><p>- In-app Chat Widget: floating ticket creation available on every screen of the Ezii application, with context-aware pre-fill and full attachment support</p><p>- Unified ticket creation, assignment, and lifecycle management across all 4 products</p><p>- Product-specific ticket categories (Payroll, Leave, Attendance, Expense)</p><p>- SLA policy engine with P1–P4 priority tiers and business-hours calendars</p><p>- Customer self-service portal (web) with ticket tracking and status updates</p><p>- Internal agent workspace with queue management and collaboration tools</p><p>- Three-tier escalation model (L1 frontline / L2 product specialist / L3 engineering)</p><p>- Role-based access control: Admin, Agent, Team Lead, Customer</p><p>- Real-time dashboards and scheduled reports</p><p>- Email and in-app notifications</p><p>- Audit trail for all ticket state changes</p>|
| :- |

|<p>**Out of Scope — v1.0**</p><p>- AI-powered auto-resolution or chatbot (planned v2.0)</p><p>- Native mobile application (web-responsive only)</p><p>- Integration with external ITSM tools (ServiceNow, Jira, Zendesk)</p><p>- WhatsApp Business API (planned v2.0)</p><p>- Billing, invoicing, or asset management workflows</p>|
| :- |



|<p>**CHAPTER 2**</p><p>**User Personas**</p>|
| :- |

# <a name="_toc225254534"></a>**2. User Personas**

ETS serves five distinct user types. Understanding their goals and pain points drives every design and workflow decision in this document.

## <a name="_toc225254535"></a>**2.1 Customer (End User)**

|**Who**|HR Manager, Finance Manager, or Employee at a company using Ezii|
| :- | :- |
|**Goal**|Raise an issue quickly, track its progress without chasing, and get a resolution with clear next steps|
|**Pain Today**|No visibility into progress; must send follow-up emails; doesn't know who owns the issue|
|**Key Needs**|Simple ticket form; real-time status tracking; notification on every update; self-serve resolution for common issues|

## <a name="_toc225254536"></a>**2.2 L1 Support Agent**

|**Who**|Ezii frontline support agent handling first-contact tickets across all products|
| :- | :- |
|**Goal**|Triage and resolve tickets efficiently; hit SLA targets; escalate clearly when needed|
|**Pain Today**|Juggling email, Slack, and spreadsheets; no SLA visibility; no canned responses; duplicate work|
|**Key Needs**|Single queue view; SLA countdown on every ticket; canned response library; one-click escalation|

## <a name="_toc225254537"></a>**2.3 L2 Product Specialist**

|**Who**|Functional expert for one or more Ezii products (e.g., Payroll Specialist, Leave Specialist)|
| :- | :- |
|**Goal**|Receive escalated tickets with full context; diagnose complex issues; coordinate with engineering if needed|
|**Pain Today**|Escalated tickets arrive without history or reproduction steps; no standard handoff format|
|**Key Needs**|Full ticket history on escalation; internal notes for context; ability to loop in L3; structured resolution template|

## <a name="_toc225254538"></a>**2.4 Support Team Lead**

|**Who**|Manages one or more support agents; accountable for team SLA and quality|
| :- | :- |
|**Goal**|Monitor team performance in real time; intervene before SLA breaches; identify training gaps|
|**Pain Today**|No real-time data; weekly manual reports; can't see SLA risk before breach occurs|
|**Key Needs**|Live SLA dashboard; agent workload view; breach warning alerts; trend reports by product|

## <a name="_toc225254539"></a>**2.5 System Administrator**

|**Who**|Ezii platform admin responsible for configuring and maintaining ETS|
| :- | :- |
|**Goal**|Set up products, workflows, SLA policies, and user roles without writing code|
|**Pain Today**|Any workflow change requires an engineering sprint; no self-serve configuration panel|
|**Key Needs**|Visual admin panel; drag-and-drop workflow editor; SLA policy builder; audit log of config changes|



|<p>**CHAPTER 3**</p><p>**System Setup & Configuration**</p>|
| :- |

# <a name="_toc225254540"></a>**3. System Setup & Configuration**

Before tickets can flow, an Administrator must configure the foundational elements of ETS. This chapter covers everything needed to go from a blank installation to a fully operational system.

## <a name="_toc225254541"></a>**3.1 Organisation & Product Setup**
### <a name="_toc225254542"></a>**3.1.1 Organisation Profile**
- Organisation name, logo, support email address, and timezone.
- Business hours definition: default Monday–Friday, 9 AM – 6 PM IST (configurable per org).
- Public holiday calendar: import national/state holidays or define custom dates.
- Customer portal URL: custom subdomain (e.g., support.ezii.com/[org-name]).

### <a name="_toc225254543"></a>**3.1.2 Product Enablement**
Each of the four Ezii products can be independently enabled or disabled for ticketing. When a product is enabled, its category taxonomy becomes available for ticket creation.

|**Product**|**Default Ticket Prefix**|**Default Routing Queue**|**Can Be Disabled?**|
| :- | :- | :- | :- |
|Payroll|PAY-|Payroll Support Queue|Yes — hides from portal and agent view|
|Leave|LEA-|Leave Support Queue|Yes|
|Attendance|ATT-|Attendance Support Queue|Yes|
|Expense|EXP-|Expense Support Queue|Yes|

## <a name="_toc225254544"></a>**3.2 Ticket Category Configuration**
Categories define how tickets are classified within each product. They drive routing, SLA assignment, and reporting granularity. Categories are managed in the Admin Panel under each product.

### <a name="_toc225254545"></a>**3.2.1 Payroll — Default Categories**

|**Category**|**Sub-categories**|
| :- | :- |
|Salary Discrepancy|Gross pay incorrect | Deductions mismatch | Arrears not processed|
|Tax & Compliance|TDS computation error | Form 16 issue | PF/ESI mismatch|
|Payslip|Not generated | Incorrect data | Download failure|
|Bank Transfer|Salary not credited | Wrong account | Partial transfer|
|Payroll Run|Run failed | Incorrect period | Revision request|
|Configuration|New employee setup | Grade / band change | Component addition|
|Statutory Reports|MIS report error | Statutory report | Export failure|

### <a name="_toc225254546"></a>**3.2.2 Leave — Default Categories**

|**Category**|**Sub-categories**|
| :- | :- |
|Leave Application|Cannot apply | Duplicate application | Unable to cancel|
|Leave Balance|Incorrect balance | Carry-forward issue | Encashment error|
|Leave Policy|Policy not applied | Entitlement mismatch | Exception request|
|Approval Workflow|Approver not notified | Auto-rejected | Delegation issue|
|Holiday Calendar|Wrong holiday listed | Restricted holiday | State-specific holiday|
|Compensatory Off|Compoff not credited | Expired compoff | Application rejected|
|Reporting|Leave report incorrect | Balance summary wrong | Export failure|

### <a name="_toc225254547"></a>**3.2.3 Attendance — Default Categories**

|**Category**|**Sub-categories**|
| :- | :- |
|Punch In / Out|Missed punch | Duplicate punch | Biometric failure|
|Regularisation|Regularisation rejected | Missing approval | Period already closed|
|Shift Management|Wrong shift assigned | Roster not updated | Night shift issue|
|Overtime|OT not calculated | OT rate incorrect | Approval pending|
|Work From Home|WFH not marked | Location tracking issue | Policy mismatch|
|Device & Integration|Biometric device offline | Mobile app issue | GPS failure|
|Reporting|Attendance summary wrong | Report mismatch | Export issue|

### <a name="_toc225254548"></a>**3.2.4 Expense — Default Categories**

|**Category**|**Sub-categories**|
| :- | :- |
|Claim Submission|Cannot submit claim | Attachment issue | Category not available|
|Approval Workflow|Approver not notified | Claim auto-rejected | Delegation issue|
|Reimbursement|Not reimbursed | Partial reimbursement | Wrong account credited|
|Policy Violation|Over policy limit | Missing receipt | Category mismatch|
|Travel Advance|Advance not released | Incorrect amount | Settlement pending|
|Receipt Management|OCR scan failure | Receipt not attached | Duplicate receipt|
|Reporting|Expense report incorrect | Budget variance | Export failure|

All categories and sub-categories above are defaults. Administrators can add, rename, or disable any category without engineering involvement.

## <a name="_toc225254549"></a>**3.3 SLA Policy Engine**
ETS operates a two-tier SLA model. Customer-facing SLAs (Tier 1) can be configured by Ezii Admins per organisation. Internal Ezii SLAs (Tier 2) govern L2 and L3 engineering work and are hard-coded by Ezii — no customer admin or organisation can view or modify them.

|<p>**Why two tiers?**</p><p>- L1 tickets are customer-visible interactions — response time expectations are a commercial relationship between Ezii and the client.</p><p>- L2 and L3 tickets involve Ezii's internal engineering and product teams. Allowing clients to set these timers would let a single customer monopolise engineering capacity or create unrealistic SLA obligations that Ezii cannot honour at scale.</p><p>- Clients see that their ticket has been escalated internally and will receive updates, but they do not see or influence the internal resolution clock.</p>|
| :- |

### <a name="_toc225254550"></a>**3.3.1 Tier 1 — Customer-Facing SLA (Configurable)**
Tier 1 SLAs define what Ezii commits to the customer: how quickly L1 agents will first respond to and resolve a ticket. These are surfaced on the customer portal and in customer-facing notifications. Ezii Admins can adjust these per organisation within permitted bounds (see Section 3.3.3).

|**Priority**|**Definition**|**L1 First Response**|**L1 Resolution Target**|**Visible to Customer?**|
| :- | :- | :- | :- | :- |
|P1 – Critical|System-wide outage or data corruption; payroll run or compliance at risk|30 min|4 hours|Yes|
|P2 – High|Major feature broken; significant users impacted; no workaround|2 hours|1 business day|Yes|
|P3 – Medium|Feature impaired; moderate impact; workaround available|4 hours|3 business days|Yes|
|P4 – Low|Minor issue, cosmetic defect, general query, or enhancement request|1 biz day|7 business days|Yes|

### <a name="_toc225254551"></a>**3.3.2 Tier 2 — Internal Ezii SLA (Non-Configurable)**
Tier 2 SLAs govern how quickly Ezii's L2 Product Specialists and L3 Engineering teams must act once a ticket is escalated to them. These timers are set by Ezii, hardcoded in the system, and are not exposed to customers or customer admins in any form.

|**Priority**|**L2 Acknowledgement**|**L2 Resolution / Pass to L3**|**L3 Acknowledgement**|**L3 Resolution Target**|
| :- | :- | :- | :- | :- |
|P1 – Critical|15 min|2 hours|30 min|4 hours|
|P2 – High|1 hour|4 business hours|2 hours|1 business day|
|P3 – Medium|4 hours|2 business days|1 biz day|3 business days|
|P4 – Low|1 biz day|5 business days|2 biz day|7 business days|

|<p>**Tier 2 SLA Rules**</p><p>- Tier 2 timers start the moment a ticket is escalated to L2 or L3 — independent of Tier 1 timers.</p><p>- Tier 2 SLA data appears only in internal dashboards and reports visible to Ezii agents, Team Leads, and Admins.</p><p>- Customers receive status updates at defined milestones (e.g., 'Your ticket has been escalated to our specialist team') but are not shown Tier 2 timer values or deadlines.</p><p>- Breaching a Tier 2 SLA triggers an internal alert to the Ezii Team Lead and escalates to the relevant engineering manager — it does not generate a customer-facing notification.</p><p>- Tier 2 SLA values can only be changed by the Ezii System Admin through a restricted configuration panel — they are not accessible via the standard Admin Panel available to customer organisations.</p>|
| :- |

### <a name="_toc225254552"></a>**3.3.3 Customer Admin SLA Configuration Bounds**
Ezii Admins can adjust Tier 1 SLA targets for specific customer organisations, subject to the following guardrails. These bounds exist to prevent commercial commitments that Ezii cannot operationally deliver.

|**Priority**|**Min First Response**|**Max First Response**|**Min Resolution**|**Max Resolution**|
| :- | :- | :- | :- | :- |
|P1 – Critical|15 min  (floor)|1 hour  (ceiling)|2 hours  (floor)|8 hours  (ceiling)|
|P2 – High|1 hour  (floor)|4 hours  (ceiling)|4 biz hours  (floor)|2 business days  (ceiling)|
|P3 – Medium|2 hours  (floor)|8 hours  (ceiling)|1 biz day  (floor)|5 business days  (ceiling)|
|P4 – Low|4 hours  (floor)|2 biz days  (ceiling)|3 biz days  (floor)|14 business days  (ceiling)|

- If an Ezii Admin attempts to set a Tier 1 SLA value outside the permitted bounds, the system rejects the input and displays the allowed range.
- All Tier 1 SLA overrides are recorded in the Admin Audit Log with before/after values and the acting admin's identity.
- Tier 1 SLA values cannot be set more aggressively than the corresponding Tier 2 values — this prevents a scenario where the customer's resolution expectation is faster than Ezii's own internal engineering target.

### <a name="_toc225254553"></a>**3.3.4 SLA Calculation Rules**
- Tier 1 timer starts the moment a ticket is created (status = New).
- Tier 2 timer starts the moment a ticket status changes to Escalated.
- Both timers pause independently when the respective ticket is in Pending status.
- Timers resume when a customer or agent responds, or when Pending duration exceeds 48 hours.
- Business hours apply to both tiers; public holidays are excluded automatically.
- Breach warning fires at 75% of elapsed SLA time for both tiers (to different audiences).
- On Tier 1 breach: auto-escalate ticket, notify customer's Org Admin and Ezii Team Lead.
- On Tier 2 breach: alert Ezii Team Lead and engineering manager — no customer notification.

### <a name="_toc225254554"></a>**3.3.5 Keyword Auto-Escalation**
Administrators can define keywords that, when detected in a new ticket's subject or description, automatically set priority to P1 and route directly to L2 or L3. Default keywords:

|**Product**|**Trigger Keywords**|
| :- | :- |
|Payroll|salary not processed, payroll failed, wrong salary, data breach, all employees, statutory deadline|
|Leave|leave data lost, negative balance for all, carry-forward wiped, compliance audit|
|Attendance|all punches missing, biometric data loss, regularisation closed for all, payroll sync failed|
|Expense|reimbursement for all, advance not disbursed, data corruption, audit requirement|

## <a name="_toc225254555"></a>**3.4 Routing & Assignment Rules**
Routing rules determine which queue or agent a new ticket is assigned to based on its attributes. Rules are evaluated in priority order; the first matching rule wins.

### <a name="_toc225254556"></a>**3.4.1 Rule Conditions**
- Product (Payroll | Leave | Attendance | Expense)
- Category and sub-category
- Priority (P1–P4)
- Reporter's organisation or customer tier
- Keywords in subject or description

### <a name="_toc225254557"></a>**3.4.2 Rule Actions**
- Assign to a specific queue
- Assign to a specific agent or round-robin across a team
- Set or override priority
- Apply a specific SLA policy
- Add a tag automatically
- Send an immediate notification to a named recipient

## <a name="_toc225254558"></a>**3.5 User & Role Management**
ETS uses Role-Based Access Control (RBAC). Roles are assigned per user; a user can hold multiple roles.

|**Role**|**Ticket Access**|**Can Assign?**|**Can Resolve?**|**Tier 1 SLA Config**|**Tier 2 SLA Config**|
| :- | :- | :- | :- | :- | :- |
|Customer|Own tickets only|No|No|No access|No access|
|Org Admin|Own organisation|No|No|No access|No access|
|L1 Agent|Assigned queue|Self|Yes|No access|No access|
|L2 Specialist|Product queue + escalated|L2 queue|Yes|No access|No access|
|L3 Engineer|All tickets|Any|Yes|No access|No access|
|Team Lead|All tickets|Any|Yes|View only|View only|
|System Admin|All tickets|Any|Yes|Edit within permitted bounds|Edit (Ezii-only restricted panel)|

## <a name="_toc225254559"></a>**3.6 Notification Templates**
Administrators can customise the content, subject, and delivery channel for every system notification. All templates support dynamic variables (e.g., {{ticket\_id}}, {{product}}, {{agent\_name}}, {{sla\_deadline}}).

|**Trigger Event**|**Default Channels**|**Recipients**|**Customisable?**|
| :- | :- | :- | :- |
|Ticket created|Email + In-app|Reporter, assigned agent|Yes|
|Agent reply added|Email + In-app|Reporter|Yes|
|Customer reply added|Email + In-app|Assigned agent|Yes|
|Ticket status changed|Email + In-app|Reporter, agent|Yes|
|SLA warning (75%)|Email + In-app|Agent, Team Lead|Yes|
|SLA breached|Email + In-app|Agent, Team Lead, Admin|Yes|
|Ticket escalated|Email + In-app|Reporter, old agent, new agent|Yes|
|Ticket resolved|Email + In-app|Reporter (with CSAT link)|Yes|
|Ticket reopened|Email + In-app|Agent, Team Lead|Yes|



|<p>**CHAPTER 4**</p><p>**Workflow Configuration**</p>|
| :- |

# <a name="_toc225254560"></a>**4. Workflow Configuration**

ETS workflows are sequential: each product-category combination has a defined sequence of steps, and tickets move through those steps in order. Auto-assignment fires at each step based on the team configured for that step, using a least-loaded agent model. There is no rule engine — behaviour is determined by the workflow sequence defined in the Admin Panel, not by conditional if/then logic.

## <a name="_toc225254561"></a>**4.1 Ticket State Machine**
All tickets share a single state machine. The states and valid transitions are fixed in v1.0. Workflow sequences operate within this structure — they determine how a ticket moves through states, not what the states are.

### <a name="_toc225254562"></a>**4.1.1 Open vs. Pending — The Key Distinction**

|<p>**Open vs. Pending**</p><p>- Open means the ball is in the agent's court. The agent is actively working the ticket. The SLA timer runs against the agent.</p><p>- Pending means the ball is in the customer's court. The agent has done what they can and is waiting — for more information, a file, a confirmation, or a third-party action. The SLA timer pauses.</p><p>- Without this distinction, every delay looks like agent slowness. Pending status is what makes SLA data accurate — it separates agent response time from customer response time.</p><p>- Agents must actively set a ticket to Pending when they are waiting on the customer. It does not auto-set. If an agent leaves a ticket Open while waiting, the SLA clock continues to run against them.</p>|
| :- |

|**Status**|**Meaning**|**SLA Timer**|**Who Can Set**|**Valid Next Statuses**|
| :- | :- | :- | :- | :- |
|New|Submitted; awaiting assignment to an agent|Running|System (auto-assign)|Open, Cancelled|
|Open|Assigned to agent; agent is actively working the ticket|Running|Agent, Lead|Pending, Escalated, Resolved|
|Pending|Agent waiting on customer response or third-party input|Paused|Agent|Open, Resolved|
|Escalated|Handed off to next tier (L2 or L3) per workflow sequence|Running|Agent, Lead, System (SLA)|Open, Resolved|
|Resolved|Issue addressed and resolution communicated to customer|Stopped|Agent, L2, L3|Closed, Reopened|
|Closed|Confirmed complete — auto-set 7 days after Resolved|Stopped|System (auto)|Reopened|
|Cancelled|Duplicate, withdrawn, or test ticket|Stopped|Agent, Customer|—|
|Reopened|Customer reported the issue has recurred within 7 days|Running|Customer, Agent|Open, Escalated|

### <a name="_toc225254563"></a>**4.1.2 Reopened State**
When a customer reopens a resolved ticket, it does not start a new ticket. The original ticket record is preserved in full — all conversation history, internal notes, and attachments remain intact. The Reopened status has specific behaviour distinct from a new Open ticket.

|**Behaviour**|**Detail**|
| :- | :- |
|SLA on reopen|The full standard SLA for the ticket's priority restarts from zero — treated identically to a brand new ticket. The previous elapsed time is discarded. This ensures the customer gets a full, fair response window regardless of what happened on the first resolution attempt.|
|Assignment on reopen|Ticket is reassigned to the same agent who resolved it. This is always the case — there is no fallback to the queue. If the agent is unavailable (OOO or deactivated), a Team Lead must manually reassign. The Team Lead is notified immediately on reopen so they can intervene if needed.|
|Tier on reopen|Ticket returns to the tier that resolved it. If L2 resolved the original, the reopen goes to L2. If L1 resolved it, it goes to L1.|
|Escalation on reopen|If the full standard SLA is breached after reopen, the ticket auto-escalates to the next tier — same logic as any standard breach.|
|Reopen window|Customer can reopen a resolved ticket for up to 7 days after resolution. After 7 days the ticket is auto-closed and cannot be reopened; a new ticket must be raised instead.|
|Reopen limit|A ticket can be reopened a maximum of 3 times. On the 3rd reopen, it is automatically escalated to L2 regardless of which tier last resolved it, and the Team Lead is notified.|
|Audit trail|Each reopen event is logged with the customer's reason (free-text field, required on reopen), timestamp, and the new SLA deadline.|

## <a name="_toc225254564"></a>**4.2 Sequential Workflow Model**
Every product-category combination has a workflow sequence: an ordered list of steps that defines which tier handles the ticket at each stage and what must happen before the ticket can advance. Sequences are defined by the Ezii System Admin in the Admin Panel — no engineering work is required to create or modify them.

### <a name="_toc225254565"></a>**4.2.1 Workflow Sequence Structure**

|**Element**|**Description**|
| :- | :- |
|Sequence name|Human-readable name (e.g., 'Payroll Run Failure — L1 → L2 → Resolution')|
|Applies to|One or more product-category (and optionally sub-category) combinations|
|Steps|Ordered list of steps; each step has a tier assignment, a team, and optional gate conditions|
|Step: Tier|Which support tier handles this step: L1, L2, or L3|
|Step: Team|Which named team within that tier handles this step (e.g., 'Payroll L2 Specialists')|
|Step: Gate|Optional condition that must be satisfied before the ticket advances to the next step (see Section 4.3)|
|Step: Auto-advance|Whether the ticket advances to the next step automatically when the gate is cleared, or requires a manual 'Advance' action by the agent|

### <a name="_toc225254566"></a>**4.2.2 Auto-Assignment Model**
When a ticket enters a new step, ETS auto-assigns it to the least-loaded available agent in the configured team — the agent with the fewest currently open tickets. This balances workload across the team without manual queue management.

- Least-loaded is calculated at the moment of assignment — it reflects live open ticket counts, not historical averages.
- 'Available' means: agent is active, not marked as Out of Office, and has not exceeded their configured max concurrent ticket cap (if set).
- If no available agent exists in the team (all OOO or at cap), the ticket is placed in the team's queue for manual claim and the Team Lead is notified.
- On reopen, the previous resolving agent takes priority over least-loaded logic (see Section 4.1.2).

### <a name="_toc225254567"></a>**4.2.3 Default Workflow Sequences**
The following sequences ship as defaults with ETS. System Admins can modify these or create new sequences for any product-category combination.

|**Sequence**|**Applies To**|**Steps**|
| :- | :- | :- |
|Standard L1 Resolution|All products — routine queries and known issues|Step 1: L1 triage and resolution. No escalation unless SLA breached.|
|L1 → L2 Escalation|Payroll Run, Tax & Compliance, Attendance Device & Integration|Step 1: L1 triage + diagnosis note (gate). Step 2: L2 investigation and resolution.|
|L1 → L2 → L3 Escalation|Any P1 ticket; Payroll data corruption; Attendance biometric data loss|Step 1: L1 triage + diagnosis note (gate). Step 2: L2 investigation. Step 3: L3 engineering fix.|
|Direct L2|Bulk Attendance regularisation (Affected Users > 10); Payroll statutory deadline|Step 1: L2 direct assignment. No L1 step.|
|Direct L3|P1 tickets with confirmed data loss or security incident keywords|Step 1: L3 direct assignment. Team Lead notified immediately.|

### <a name="_toc225254568"></a>**4.2.4 Creating a Custom Sequence (Admin Panel)**
1. Navigate to Admin Panel → Workflow → Sequences → New Sequence.
1. Enter a sequence name and select the product(s) and categories it applies to.
1. Add steps in order: for each step, select the tier (L1/L2/L3) and the team responsible.
1. Optionally add a gate condition to each step (see Section 4.3).
1. Set auto-advance on or off per step.
1. Save and activate. The sequence applies to all new tickets matching the configured categories; in-flight tickets are not affected.

## <a name="_toc225254569"></a>**4.3 Stage Gates**
A stage gate is a condition that must be satisfied before a ticket can advance to the next workflow step. Gates are optional per step and are configured by the System Admin. The advance button (or auto-advance) is blocked until the gate clears.

|**Gate Type**|**What It Checks**|**Hardcoded or Configurable**|
| :- | :- | :- |
|Diagnosis Note|Agent must have added an internal note labelled 'Diagnosis Note' before the ticket can advance from Step 1 (L1) to Step 2 (L2 or L3). Prevents uninformed escalations.|Hardcoded on all L1 → L2/L3 transitions|
|Resolution Notes|Resolution Notes field must contain a minimum number of characters (default: 50) before the ticket can be set to Resolved.|Min length configurable by Admin|
|Required Field|A specified standard or custom field must be non-empty. Example: 'Regularisation Date' must be filled before an Attendance ticket resolves.|Fully configurable per step|
|Cancellation Reason|Agent must select a reason from a predefined list before setting status to Cancelled.|List configurable by Admin|

## <a name="_toc225254570"></a>**4.4 SLA-Triggered Automatic Actions**
The following actions fire automatically based on SLA timers. They are part of the SLA policy engine (Chapter 3) but are documented here as they directly affect ticket state and assignment.

|**Trigger**|**Tier**|**Automatic Action**|
| :- | :- | :- |
|75% of First Response SLA elapsed|Tier 1|Notify assigned agent and Team Lead|
|First Response SLA breached|Tier 1|Notify agent, Team Lead, Admin; post internal breach note on ticket|
|75% of Resolution SLA elapsed|Tier 1|Notify agent and Team Lead|
|Resolution SLA breached|Tier 1|Advance ticket to next workflow step (escalate tier); notify agent, Team Lead, Admin, and customer Org Admin|
|75% of Tier 2 Acknowledgement SLA|Tier 2|Notify L2/L3 agent and Team Lead (internal only — no customer notification)|
|Tier 2 Acknowledgement SLA breached|Tier 2|Notify Team Lead and Engineering Manager (internal only)|
|Pending > 48 hours (no customer reply)|—|Auto-return ticket to Open; SLA timer resumes; notify assigned agent|
|Resolved, no reopen within 7 days|—|Auto-close ticket|

## <a name="_toc225254571"></a>**4.5 Workflow Audit Trail**
- Every workflow step transition is logged: step name, trigger (manual advance or SLA), actor, timestamp, and gate conditions evaluated.
- Every gate check is logged: which gate ran, whether it passed or blocked, and the acting agent's identity.
- Every auto-assignment event is logged: which team was evaluated, the least-loaded agent selected, and the open ticket count at the time of assignment.
- All audit records are immutable and retained alongside the ticket's main activity log. Team Leads can view the workflow log from the ticket detail panel.

## <a name="_toc225254572"></a>**4.6 v2.0 — Planned Enhancements**
- Conditional branching within sequences: workflow paths that fork based on field values (e.g., if Amount > 50,000 take a different step path).
- Named human approvers: a specific person must explicitly approve before the ticket can advance.
- Parallel steps: multiple steps running concurrently with a join gate that waits for all to complete.
- Per-ticket workflow override: Team Leads can manually reassign a ticket to a different sequence mid-flight.



|<p>**CHAPTER 5**</p><p>**Chat Widget — In-App Ticket Creation**</p>|
| :- |

# <a name="_toc225254573"></a>**5. Chat Widget — In-App Ticket Creation**

The Chat Widget is the primary ticket creation surface for customers. It is a persistent, floating button available on every screen of the Ezii application — customers never need to navigate away from their current task to raise a support ticket. The widget opens as a side drawer or modal and supports the full ticket creation flow, including file attachments, without redirecting to the dedicated ticketing portal.

|<p>**Design Principle**</p><p>- The widget is the front door. The self-service portal (Chapter 6) is for managing and tracking tickets after they have been raised. The vast majority of customers will create tickets exclusively through the widget and never visit the portal directly.</p><p>- The widget must feel native to the Ezii application — same design system, same fonts, no context switching.</p>|
| :- |

## <a name="_toc225254574"></a>**4.1 Widget Availability & Placement**
- The widget launcher is a fixed floating action button (FAB), positioned in the bottom-right corner of every screen in the Ezii application.
- Visible across all four product modules: Payroll, Leave, Attendance, and Expense.
- Context-aware: the widget automatically pre-selects the Product field based on the module the user is currently viewing (e.g., opening the widget on the Leave module pre-fills Product = Leave).
- Available to all authenticated users; no additional login or navigation required.
- The FAB displays a notification badge showing the count of the user's open tickets, so they always have a live status indicator without opening the widget.

## <a name="_toc225254575"></a>**4.2 Widget States**

|**State**|**What the User Sees**|
| :- | :- |
|Collapsed (default)|A circular FAB with a headset/support icon and an open ticket count badge. Single click expands the widget.|
|Expanded — Home|A compact panel showing: 'Raise a Ticket' CTA button, count of open tickets with a 'View my tickets' link, and the current system status banner if any active incident exists.|
|Expanded — New Ticket|The guided ticket creation form (see Section 4.3). Opens when the user clicks 'Raise a Ticket'.|
|Expanded — My Tickets|A scrollable list of the user's open and recently resolved tickets with status badges and one-click to view detail.|
|Expanded — Ticket Detail|A threaded conversation view for a specific ticket: full message history, status, SLA countdown, and a reply/update input field.|
|Minimised|User can minimise the expanded widget to a slim tab at the screen edge without closing it, preserving their draft.|

## <a name="_toc225254576"></a>**4.3 New Ticket Creation Flow**
The creation form inside the widget is identical in data capture to the portal form, but optimised for a compact, conversational layout. The form is stepped to reduce cognitive load — users only see the fields relevant to their current step.

### <a name="_toc225254577"></a>**4.3.1 Step-by-Step Flow**

|**Step**|**What the User Does**|**Smart Behaviour**|
| :- | :- | :- |
|1|Select Product|Pre-filled based on the active module. User can change if needed. Only enabled products are shown.|
|2|Select Category|Dropdown dynamically populated from the selected product's category tree.|
|3|Select Sub-category|Optional. Shown only after a category is selected. Skippable with a 'Not sure' option — agent will classify on receipt.|
|4|Enter Subject|Single-line text, max 200 characters. Placeholder text gives a prompt (e.g., 'Briefly describe the issue').|
|5|Describe the Issue|Multi-line text area. Supports plain text only in the widget (full rich text available in the portal).|
|6|Add Attachments|Tap to upload or drag-and-drop. Max 10 files, 20 MB each. Supported: PDF, JPG, PNG, XLSX, CSV, DOCX. Preview thumbnails shown inline.|
|7|Review & Submit|Summary card showing all entered fields. User confirms and submits. Ticket ID shown immediately on success.|

### <a name="_toc225254578"></a>**4.3.2 Field Behaviour in the Widget**

|**Field**|**Required?**|**Widget Behaviour**|
| :- | :- | :- |
|Product|Yes|Auto-detected from active module; editable. Drives the category list.|
|Category|Yes|Cascading dropdown; resets sub-category if changed.|
|Sub-category|No|Optional; 'Not sure' option available.|
|Subject|Yes|Character count displayed. Submit blocked if empty.|
|Description|Yes|Min 20 characters enforced to avoid empty or uninformative tickets.|
|Attachments|No|Upload progress bar shown per file. Failed uploads flagged inline with retry option.|
|Priority|No|Not shown to the customer. Auto-assigned by routing rules on submission.|
|Affected Users|No|Hidden by default in widget; shown if product = Payroll or Attendance (higher business impact).|
|Tags|No|Hidden in widget; available in the portal detail view after submission.|

### <a name="_toc225254579"></a>**4.3.3 Draft Persistence**
- Widget drafts are saved automatically every 10 seconds to local session storage.
- If the user navigates away, switches modules, or minimises the widget, the draft is preserved and restored when the widget is reopened.
- A 'Draft saved' indicator is shown in the widget header while a draft exists.
- On successful submission, the draft is cleared. On cancel, the user is prompted to confirm ('Discard draft?') before the draft is deleted.

## <a name="_toc225254580"></a>**4.4 Viewing & Updating Tickets in the Widget**
After submission, customers can manage their tickets directly from the widget without navigating to the portal. The widget supports the full conversation lifecycle.

### <a name="_toc225254581"></a>**4.4.1 My Tickets List**
- Displays all open and recently resolved tickets (last 30 days) for the logged-in user.
- Each row shows: ticket ID, product icon, subject (truncated), status badge, and time since last update.
- Sorted by most recently updated by default.
- Tap any row to open the Ticket Detail view within the widget.

### <a name="_toc225254582"></a>**4.4.2 Ticket Detail in Widget**
- Full chronological conversation thread: customer messages and agent replies, each with sender name, timestamp, and read indicator.
- Status bar: current status and SLA countdown (e.g., 'Open — response due in 1h 45m').
- Reply input: customer can type a follow-up message and attach files directly from the widget.
- Attachments: tap any attachment to preview (images) or download (documents).
- 'Request Escalation' button appears after 24 hours with no agent update.
- 'Mark as Resolved' — if the customer considers the issue self-resolved, they can close the ticket from the widget.

## <a name="_toc225254583"></a>**4.5 Widget — Technical & UX Specifications**
### <a name="_toc225254584"></a>**4.5.1 Rendering**
- Implemented as an embedded React component injected into the Ezii application shell — not an iframe. This ensures it inherits the application's auth session, design tokens, and routing context.
- Widget width: 400px (desktop); full-screen overlay on mobile viewports < 768px.
- Widget height: 600px fixed on desktop; dynamic on mobile.
- Z-index layering: widget sits above all standard application content but below system-level modals (e.g., session timeout warnings).

### <a name="_toc225254585"></a>**4.5.2 Performance**
- Widget bundle size: < 150 KB gzipped to avoid impacting application load time.
- Widget initialises lazily — code is not downloaded until the user first clicks the FAB.
- Ticket list and detail data fetched on demand; not pre-loaded to avoid unnecessary API calls.

### <a name="_toc225254586"></a>**4.5.3 Accessibility**
- FAB is keyboard-reachable (Tab order) with a visible focus ring.
- Widget trap focus when open (keyboard users cannot accidentally interact with content behind the widget).
- All form fields have associated labels; error messages are announced to screen readers via ARIA live regions.
- Escape key closes the widget (with draft-save prompt if a draft exists).

### <a name="_toc225254587"></a>**4.5.4 Context Passing**
When the widget is opened on a specific Ezii screen, it passes contextual metadata to the ticket on creation. This gives agents richer diagnostic context without the customer needing to describe their location in the app.

|**Ezii Screen**|**Context Auto-Attached to Ticket**|
| :- | :- |
|Payroll — Run Summary|Current payroll period, run status, number of employees in run|
|Payroll — Payslip View|Employee ID, payslip month, payslip reference|
|Leave — My Leaves|Employee ID, leave type currently viewed, balance snapshot|
|Leave — Approval Queue|Approver ID, leave application ID currently on screen|
|Attendance — Monthly Summary|Employee ID, month, any flagged exceptions visible on screen|
|Attendance — Regularisation|Regularisation request ID if one is open|
|Expense — Claim Form|Expense claim ID if a draft exists, expense category|
|Expense — Approval Queue|Claim ID, approver ID, claim amount|

Context metadata is visible to agents in the ticket detail view as a collapsible 'App Context' panel. It is not shown to the customer.

## <a name="_toc225254588"></a>**4.6 Widget Behaviour by Role**

|**Role**|**Can Create Ticket?**|**Can View Tickets?**|**Can Reply?**|**Notes**|
| :- | :- | :- | :- | :- |
|Employee / Customer|Yes|Own tickets|Yes|Primary use case|
|Org Admin|Yes|Own org tickets|Yes|Can see all employees' tickets|
|L1 Agent|Yes|Assigned queue|Yes|Agent view of widget shows queue, not just own tickets|
|L2 / L3|Yes|Escalated to them|Yes|Same as L1 Agent|
|System Admin|Yes|All tickets|Yes|Full access; can also configure widget settings|

## <a name="_toc225254589"></a>**4.7 Widget Configuration (Admin)**
- FAB colour and icon: customisable to match the organisation's brand palette.
- Default position: bottom-right (default) or bottom-left, configurable per org.
- Greeting message: the text shown on the widget home panel is configurable (e.g., 'Hi Priya, how can we help?').
- Context passing: Admins can enable or disable automatic context metadata attachment per module.
- Widget can be temporarily disabled system-wide by a System Admin (e.g., during maintenance) — the FAB is hidden and replaced with a maintenance notice.



|<p>**CHAPTER 6**</p><p>**Employee & Customer Processes**</p>|
| :- |

# <a name="_toc225254590"></a>**6. Employee & Customer Processes**

This chapter covers every interaction a customer or employee has with ETS — from raising a ticket to receiving a resolution and providing feedback. For the primary ticket creation experience, see Chapter 4 (Chat Widget).

## <a name="_toc225254591"></a>**5.1 Ticket Creation Channels**
Customers can raise tickets through three channels. All channels create the same ticket object with the same fields and SLA rules — the channel is recorded on the ticket for reporting purposes.

|**Channel**|**Description**|**Best For**|
| :- | :- | :- |
|Chat Widget (primary)|Floating widget embedded in the Ezii application; context-aware; no navigation required. Full field support including attachments. See Chapter 4.|All customers; everyday use|
|Self-Service Portal|Dedicated web portal (support.ezii.com); full-featured ticket management and history. Accessible outside the Ezii application.|Viewing ticket history; raising tickets outside the app|
|Email|Inbound email to product-specific address (e.g., payroll-support@ezii.com). Subject becomes ticket subject; body becomes description.|Customers who prefer email; fallback channel|

|**Field**|**Type**|**Required**|**Notes**|
| :- | :- | :- | :- |
|Ticket ID|Auto-generated|Yes (system)|Format: [PRODUCT PREFIX]-[5-digit number] e.g. PAY-00123|
|Product|Dropdown|Yes|Payroll | Leave | Attendance | Expense|
|Category|Dropdown|Yes|Product-specific, see Section 3.2|
|Sub-category|Dropdown|No|Narrows routing; shown only after category selected|
|Subject|Text (max 200)|Yes|Concise issue title|
|Description|Rich text|Yes|Full context; supports bullet points and inline images|
|Priority|Dropdown|Customer: No|Customers do not set priority; auto-calculated by routing rules|
|Attachments|File upload|No|Max 10 files, 20 MB each|
|Affected Users|Number|No|Helps agents gauge severity|
|Tags|Multi-text|No|Customer can add free-form labels|

## <a name="_toc225254592"></a>**5.2 Self-Service Portal**
The self-service portal is a dedicated web interface for managing tickets, viewing history, and handling account-level settings. It complements the widget — customers who want a full-screen experience, or who need to access ETS from outside the Ezii application, use the portal.

### <a name="_toc225254593"></a>**5.2.1 Authentication**
- Login via SSO (SAML 2.0 integration with the customer's identity provider).
- Fallback: email + OTP (6-digit, 10-minute expiry) — no separate password required.
- Customers only see tickets from their own organisation.
- Org Admins see all tickets raised by any employee in their organisation.

### <a name="_toc225254594"></a>**5.2.2 Portal Home**
- 'Raise a Ticket' button available (mirrors the widget flow for consistency).
- Open tickets summary card: total open, pending customer response, recently resolved.
- Announcements banner: Admins can post service notices (e.g., scheduled maintenance).

## <a name="_toc225254595"></a>**5.3 Ticket Fields Reference**
The following fields apply to all tickets regardless of creation channel (widget, portal, or email).
## <a name="_toc225254596"></a>**5.4 Tracking a Ticket**
### <a name="_toc225254597"></a>**5.4.1 Ticket List View**
- Filterable by status, product, date range, and priority.
- Colour-coded status badges for quick visual scanning.
- SLA countdown visible for open tickets (e.g., 'Response due in 3h 20m').

### <a name="_toc225254598"></a>**5.4.2 Ticket Detail View (Customer)**
- Full conversation thread: all agent replies and customer updates in chronological order.
- Status timeline: visual progress bar showing New → Open → Resolved → Closed.
- File attachments: both customer-uploaded and agent-provided files accessible.
- Add update: customer can post a follow-up comment or upload additional files at any time.
- Request escalation: after 24 hours with no agent update, a 'Request Escalation' button becomes available.

## <a name="_toc225254599"></a>**5.5 Notifications & Communication**
- Email notification on every key event (ticket created, agent reply, status change, resolution).
- In-app bell icon shows unread notification count.
- Customers can set their notification preference: all events, replies only, or resolution only.
- Replies to the notification email are threaded back into the ticket automatically.

## <a name="_toc225254600"></a>**5.6 Resolution & CSAT Survey**
When an agent marks a ticket as Resolved, the customer receives an email and in-app notification with:

- A summary of the resolution and any steps taken.
- A CSAT survey: single 1–5 star rating + optional open comment field.
- A 'Reopen Ticket' button available for 7 days post-resolution.
- If CSAT is 1 or 2 stars, a follow-up task is auto-created for the Team Lead to review.



|<p>**CHAPTER 7**</p><p>**Agent Processes**</p>|
| :- |

# <a name="_toc225254601"></a>**7. Agent Processes**

This chapter defines the workflows, tools, and standards for L1 Support Agents, L2 Product Specialists, and L3 Engineers as they handle tickets within ETS.

## <a name="_toc225254602"></a>**7.1 Ticket Lifecycle**
Every ticket moves through a defined set of statuses. The following table describes each status, what it means, and what actions are permitted.

|**Status**|**Meaning**|**Who Can Set**|**Valid Next Statuses**|
| :- | :- | :- | :- |
|New|Submitted; not yet assigned or reviewed|System (auto)|Open, Cancelled|
|Open|Assigned to an agent; under active work|Agent, Lead|Pending, Escalated, Resolved|
|Pending|Waiting for customer input or third-party action|Agent|Open, Resolved|
|Escalated|Handed off to L2 or L3 for specialist handling|Agent, Lead, System|Open, Resolved|
|Resolved|Issue addressed; resolution communicated|Agent, L2, L3|Closed, Reopened|
|Closed|Confirmed complete; no further action|System (auto, 7 days)|Reopened|
|Cancelled|Duplicate or withdrawn by customer/agent|Agent, Customer|—|
|Reopened|Customer reported recurrence within 7 days|Customer, Agent|Open, Escalated|

## <a name="_toc225254603"></a>**7.2 Agent Workspace**
### <a name="_toc225254604"></a>**5.2.1 Queue Views**
- My Tickets: all tickets currently assigned to the logged-in agent.
- Team Queue: all unassigned tickets in the agent's product queues.
- SLA Risk View: tickets approaching breach, sorted by urgency.
- Escalated to Me: tickets escalated specifically to this agent or their tier.
- All Products: full ticket view with cross-product filters (Team Lead and Admin only).

### <a name="_toc225254605"></a>**5.2.2 List View Controls**
- Sort by: created date, SLA deadline, priority, last updated.
- Filter by: product, status, priority, assignee, category, date range, tag.
- Bulk actions: assign, change priority, add tag, close — applied to selected tickets.
- Collision indicator: a presence badge warns if another agent has the ticket open.

## <a name="_toc225254606"></a>**7.3 Working a Ticket**
### <a name="_toc225254607"></a>**5.3.1 Ticket Detail View (Agent)**
- Conversation thread: full history of customer and agent messages with timestamps.
- Internal notes: agent-only comments (clearly marked; never visible to customers).
- Activity log: every status change, assignment change, and SLA event, with actor and timestamp.
- Linked tickets: associate related or parent-child tickets; SLA of parent reflects child status.
- Time tracking: log hours spent on this ticket for capacity reporting.
- Contextual customer data panel: reporter's name, organisation, product subscription, and previous tickets.

### <a name="_toc225254608"></a>**5.3.2 Replying to a Customer**
- Rich-text reply composer with formatting, inline images, and file attachments.
- Canned responses: searchable library of pre-approved reply templates scoped per product.
- Draft auto-save: reply drafts are saved every 30 seconds to prevent data loss.
- Send and set status: agent can reply and change the ticket status in a single action (e.g., 'Reply and set to Pending').

## <a name="_toc225254609"></a>**7.4 Escalation Workflows**
### <a name="_toc225254610"></a>**5.4.1 Support Tier Model**

|**Tier**|**Team**|**Handles**|**Max Hold Time**|
| :- | :- | :- | :- |
|L1|Frontline Support|Initial triage, known issues, standard queries, and basic configuration guidance|Per SLA tier|
|L2|Product Specialists|Complex functional issues, configuration problems, data anomalies, policy exceptions|Per SLA tier|
|L3|Engineering / DevOps|Confirmed product bugs, data fixes, infrastructure incidents, security events|Per SLA tier|

### <a name="_toc225254611"></a>**5.4.2 Escalation Triggers**
- Manual: agent selects 'Escalate' from the ticket action menu, chooses the target tier, and adds a mandatory handoff note.
- SLA breach: auto-escalation fires per the priority matrix defined in Section 3.3.1.
- Customer-initiated: customer presses 'Request Escalation' from the portal after 24 hours without an agent update.
- Keyword match: P1 keywords trigger immediate L2/L3 routing on ticket creation (see Section 3.3.3).

### <a name="_toc225254612"></a>**5.4.3 Escalation Handoff Standard**
When escalating, the agent must complete a structured handoff note:

|**Field**|**Required?**|**Description**|
| :- | :- | :- |
|Issue Summary|Yes|One-sentence summary of the problem|
|Steps to Reproduce|Yes (for L3)|How to replicate the issue|
|Impact|Yes|Number of users affected; business consequence|
|What Has Been Tried|Yes|Troubleshooting steps already taken|
|Target Tier|Yes|L2 or L3 selection with team or individual name|
|Escalation Reason|Yes|SLA breach | Complexity | Customer request | Policy|



|<p>**CHAPTER 8**</p><p>**Admin Processes**</p>|
| :- |

# <a name="_toc225254613"></a>**8. Admin Processes**

This chapter covers all administration workflows — managing users, adjusting configurations, maintaining system health, and ensuring compliance and audit readiness.

## <a name="_toc225254614"></a>**8.1 Admin Panel Overview**
The Admin Panel is accessible only to users with the System Admin or Team Lead role. It is a separate interface from the agent workspace. Configuration changes made in the Admin Panel take effect immediately (no deployment required) and are recorded in the Admin Audit Log.

|**Admin Panel Section**|**What Can Be Configured**|
| :- | :- |
|Organisation|Profile, logo, business hours, holiday calendar, support email addresses|
|Products|Enable/disable products; category and sub-category management|
|SLA Policies (Tier 1)|Adjust customer-facing SLA targets per org, within Ezii-defined bounds; view Tier 2 values (read-only)|
|Routing Rules|Create and sequence auto-assignment rules|
|Users & Roles|Invite users, assign roles, deactivate accounts, manage teams|
|Notification Templates|Customise all system notification templates and delivery channels|
|Canned Responses|Create, edit, organise, and assign canned response libraries to products/agents|
|Custom Fields|Add product-specific fields to the ticket form|
|API & Webhooks|Generate API tokens; configure outbound webhook endpoints|
|Audit Log|Read-only log of all admin and agent actions; exportable|

## <a name="_toc225254615"></a>**7.2 User Lifecycle Management**
### <a name="_toc225254616"></a>**6.2.1 Onboarding an Agent**
1. Admin navigates to Users & Roles → Invite User.
1. Enters name, email, role (L1 / L2 / L3 / Team Lead), and product assignment.
1. System sends an invitation email with a one-time login link (valid 48 hours).
1. Agent completes profile setup and is added to the relevant product queues.

### <a name="_toc225254617"></a>**6.2.2 Offboarding an Agent**
1. Admin navigates to the agent's profile and selects Deactivate Account.
1. System auto-reassigns all open tickets from the deactivated agent (round-robin or to a nominated agent).
1. Deactivated users retain read access to historical tickets but cannot create or update tickets.
1. Account can be reactivated within 30 days; after 30 days it is archived.

### <a name="_toc225254618"></a>**6.2.3 Managing Customer Org Admins**
- Customer Org Admins are created by the System Admin on behalf of a new customer.
- Org Admin can invite additional users from their own organisation (employee view only).
- Org Admin cannot change SLA policies, routing rules, or system configuration.

## <a name="_toc225254619"></a>**8.3 Queue & Workload Management**
- Admins and Team Leads can rebalance open tickets across agents via drag-and-drop reassignment.
- Out-of-office mode: agent can mark themselves OOO for a date range; their tickets auto-redistribute.
- Max ticket cap: optionally set a maximum concurrent open-ticket count per agent; overflow goes to team queue.
- Queue health view: shows per-agent open ticket count, oldest open ticket, and SLA risk count.

## <a name="_toc225254620"></a>**8.4 Custom Fields**
Admins can add product-specific custom fields to the ticket form without engineering work. Supported field types:

- Text (single line / multi-line)
- Number
- Date / Date-time
- Dropdown (single or multi-select)
- Checkbox
- File upload

Custom fields can be marked required or optional, and can be shown only to agents (internal) or to customers as well.

## <a name="_toc225254621"></a>**8.5 Audit & Compliance**
### <a name="_toc225254622"></a>**6.5.1 Ticket Audit Trail**
- Every state change, assignment change, field edit, and comment addition is recorded with actor, timestamp, and old/new values.
- Audit trail is immutable — no actor (including Admin) can edit or delete audit records.
- Exportable as PDF or CSV for compliance reviews.

### <a name="_toc225254623"></a>**6.5.2 Admin Audit Log**
- All Admin Panel configuration changes are logged: who changed what, from what value, to what value, at what time.
- Retained for 24 months.

### <a name="_toc225254624"></a>**6.5.3 Data Retention & Deletion**
- Closed tickets retained for 36 months by default (configurable per organisation: 12–72 months).
- PII fields (salary amounts, bank details) are masked in data exports and logs.
- DPDP Act 2023 right-to-erasure: customer data deletion processed within 30 days of account termination request.



|<p>**CHAPTER 9**</p><p>**Notifications & Communications**</p>|
| :- |

# <a name="_toc225254625"></a>**9. Notifications & Communications**

Effective notifications keep all stakeholders informed at the right time without creating noise. This chapter defines the full notification matrix and the communication standards for ETS.

## <a name="_toc225254626"></a>**9.1 Notification Matrix**

|**Event**|**Customer**|**Agent**|**Team Lead**|**Admin**|**Channel**|
| :- | :- | :- | :- | :- | :- |
|Ticket created|Email|In-app|—|—|Email + In-app|
|Ticket assigned to agent|—|Email+App|—|—|Email + In-app|
|Agent reply added|Email+App|—|—|—|Email + In-app|
|Customer reply added|—|Email+App|—|—|Email + In-app|
|Status changed|Email+App|In-app|—|—|Email + In-app|
|Pending timeout (48h)|Email|Email+App|—|—|Email + In-app|
|SLA warning (75%)|—|Email+App|Email+App|—|Email + In-app|
|SLA breached|—|Email+App|Email+App|Email|Email + In-app|
|Ticket escalated|Email|Email+App|In-app|—|Email + In-app|
|Ticket resolved|Email+CSAT|In-app|—|—|Email + In-app|
|CSAT score ≤ 2 stars|—|In-app|Email+App|—|Email + In-app|
|Ticket reopened|—|Email+App|Email+App|—|Email + In-app|

## <a name="_toc225254627"></a>**9.2 Email-to-Ticket**
Customers can raise and update tickets directly via email, without visiting the portal. This is the fallback channel for customers who prefer email.

- Each product has a dedicated inbound support email address (e.g., payroll-support@ezii.com).
- Inbound emails create a new ticket automatically with the email subject as the ticket subject and body as the description.
- Subsequent email replies from the same sender are threaded into the existing open ticket.
- CC'd recipients on the original email are added as ticket followers (receive updates but cannot reply).
- Attachments in emails are automatically attached to the ticket.

## <a name="_toc225254628"></a>**9.3 Notification Preferences**
- Customers can set preferences: All events | Replies only | Resolution only | None.
- Agents can configure digest mode: individual alerts or hourly digest during business hours.
- Team Leads receive SLA warning and breach alerts by default; this cannot be disabled.



|<p>**CHAPTER 10**</p><p>**Dashboards**</p>|
| :- |

# <a name="_toc225254629"></a>**10. Dashboards**

ETS provides role-specific dashboards that give each user the operational data most relevant to their job. All dashboards refresh every 60 seconds by default; Team Leads can switch to a 10-second real-time mode.

## <a name="_toc225254630"></a>**10.1 Agent Dashboard**
Displayed immediately upon login. Focused on personal productivity and task management.

|**Widget**|**Description**|
| :- | :- |
|My Open Tickets|Count and list of all tickets currently assigned to the agent, sorted by SLA deadline|
|SLA Risk Counter|Number of my tickets in breach-warning state (orange) or breached (red)|
|Pending Customer Reply|Tickets in Pending status where the customer has not responded in 24+ hours|
|Today's Activity|Tickets opened, resolved, and replied to today by this agent|
|Recent Tickets|Last 10 tickets touched, with quick-click to open any of them|
|Team Queue Size|Unassigned ticket count in each product queue this agent covers|

## <a name="_toc225254631"></a>**10.2 Team Lead Dashboard**
Comprehensive operational view for monitoring team performance and SLA health in real time.

|**Widget**|**Description**|
| :- | :- |
|SLA Health Heatmap|Visual grid of all open tickets colour-coded by SLA status: green (on track), amber (warning), red (breached)|
|Ticket Volume by Product|Bar chart: open ticket count per product (Payroll / Leave / Attendance / Expense)|
|Agent Workload|Per-agent card showing: open tickets, avg response time today, CSAT, SLA breach count|
|Escalation Funnel|Sankey-style diagram showing tickets flowing from L1 → L2 → L3|
|Oldest Open Tickets|Top 10 longest-open tickets with owner, product, and age in business hours|
|CSAT Trend|7-day rolling average CSAT score with breakdown by product|
|Resolution Rate Today|Tickets resolved vs. opened today; net queue change (positive = shrinking)|
|Breach Alert Feed|Live feed of tickets that have breached or are approaching breach in the next 30 minutes|

## <a name="_toc225254632"></a>**10.3 Management / Executive Dashboard**
High-level operational summary for leadership. Focused on trends, KPIs, and strategic signals.

|**Widget**|**Description**|
| :- | :- |
|SLA Attainment %|Monthly and weekly SLA attainment rate (First Response and Resolution), with trend sparkline|
|MTTR by Product|Mean Time to Resolution per product, current month vs. previous month|
|Volume Trend|Line chart: daily ticket creation over the last 30 days, broken down by product|
|Top Issue Categories|Ranked list of the 10 most common ticket categories across all products this month|
|CSAT Score|Overall rolling 30-day CSAT with product breakdown and month-on-month delta|
|Escalation Rate|% of tickets escalated from L1 to L2 or L3, by product and over time|
|Open Tickets by Age|Stacked bar: tickets grouped by age bucket (< 1 day, 1–3 days, 3–7 days, > 7 days)|

## <a name="_toc225254633"></a>**10.4 Customer Dashboard (Portal Home)**
Simplified summary view visible to customers on their portal home screen.

- Open tickets count with status breakdown (Open, Pending, Escalated).
- Recently resolved tickets (last 5, with resolution date and summary).
- CSAT prompt: if any resolved tickets have not yet been rated, a prompt is shown.
- Service status banner: any active platform incidents relevant to the customer's subscribed products.



|<p>**CHAPTER 11**</p><p>**Reports**</p>|
| :- |

# <a name="_toc225254634"></a>**11. Reports**

ETS provides a structured reporting suite for scheduled delivery and ad-hoc analysis. All reports can be exported in PDF, Excel, or CSV format. Access is role-gated — agents see their own data; Team Leads see team data; Admins see all.

## <a name="_toc225254635"></a>**11.1 Standard Reports**

### <a name="_toc225254636"></a>**9.1.1 Daily Operations Digest**
Audience: Team Lead, Admin  |  Delivery: Email, 8 AM on every business day

- Overnight ticket volume: tickets created, resolved, and net queue change since previous day's close.
- P1 / P2 open tickets: full list with age, assignee, and SLA status.
- SLA breaches in the last 24 hours: ticket ID, product, priority, breach duration, and responsible agent.
- Pending tickets past 48 hours (customer has not responded).

### <a name="_toc225254637"></a>**9.1.2 Weekly Performance Summary**
Audience: Team Lead, Admin  |  Delivery: Email, Monday 8 AM

- Ticket volume: created, resolved, and backlog trend for the past 7 days.
- SLA attainment: first response and resolution SLA % by priority tier and product.
- Top 5 ticket categories for the week across all products.
- Agent scorecards: tickets handled, avg response time, resolution rate, and CSAT per agent.
- Escalation summary: L1→L2 and L2→L3 counts and escalation rate by product.

### <a name="_toc225254638"></a>**9.1.3 Monthly Executive Report**
Audience: Leadership, Admin  |  Delivery: Email, 1st of each month

- Month-on-month KPIs: volume, MTTR, SLA attainment, and CSAT.
- Product breakdown table: one row per product showing all key metrics side by side.
- Top issue themes: ranked categories and sub-categories with trend vs. prior month.
- CSAT verbatim highlights: top-rated and lowest-rated customer comments (anonymised).
- Escalation analysis: breakdown of escalation reasons and tier distribution.
- Recommendations section: automatically flagged anomalies (e.g., 'Payroll-Tax tickets up 40% vs. last month').

### <a name="_toc225254639"></a>**9.1.4 SLA Compliance Report**
Audience: Admin, Team Lead  |  Delivery: On-demand or scheduled

- Full audit of every ticket that breached an SLA: ticket ID, product, priority, SLA type, breach duration, and resolution status.
- SLA attainment % by product, priority, and agent for a selected date range.
- Breach pattern analysis: time of day, day of week, and category breakdown for breached tickets.

### <a name="_toc225254640"></a>**9.1.5 Agent Performance Report**
Audience: Team Lead, Admin  |  Delivery: On-demand or weekly

- Per-agent metrics for a selected period: tickets handled, avg first response time, avg resolution time, CSAT, and SLA breach count.
- Comparative ranking table across the team.
- Canned response usage rate (proxy for process adherence).

## <a name="_toc225254641"></a>**11.2 Custom Report Builder**
Admins and Team Leads can build bespoke reports without engineering support.

- Drag-and-drop column selector: choose any combination of ticket fields, SLA metrics, agent data, and CSAT scores.
- Group by: product, category, agent, priority, status, date (day / week / month).
- Filters: apply any combination of field-level filters (e.g., 'Payroll tickets, P2 and above, last 90 days').
- Visualisation: table, bar chart, line chart, or pie chart.
- Save and schedule: save report configuration; set a delivery schedule (daily, weekly, monthly) to one or more email recipients.
- Export: PDF, Excel, or CSV on demand.

## <a name="_toc225254642"></a>**11.3 Data Access & Permissions**

|**Report**|**L1 Agent**|**L2/L3**|**Team Lead**|**Admin**|**Org Admin (Customer)**|
| :- | :- | :- | :- | :- | :- |
|Daily Digest|Own only|Own only|Full team|Full|Own org only|
|Weekly Summary|Own only|Own only|Full team|Full|Own org only|
|Monthly Executive Report|No|No|Full team|Full|No|
|SLA Compliance Report|Own only|Own only|Full team|Full|Own org only|
|Agent Performance Report|Own only|Own only|Full team|Full|No|
|Custom Report Builder|No|No|Yes|Full|No|



|<p>**CHAPTER 12**</p><p>**Non-Functional Requirements**</p>|
| :- |

# <a name="_toc225254643"></a>**12. Non-Functional Requirements**

## <a name="_toc225254644"></a>**12.1 Performance**
- Portal page load time < 2 seconds on a standard broadband connection (10 Mbps+).
- Ticket submission confirmed < 3 seconds end-to-end.
- Agent workspace list view renders within 1.5 seconds for up to 500 tickets.
- Dashboard refresh: 60 seconds default; 10-second real-time mode available.
- System must support 500 concurrent agent sessions without degradation.

## <a name="_toc225254645"></a>**12.2 Scalability**
- Horizontal scaling to handle 10x current ticket volume without architectural changes.
- Database schema designed for up to 5 million tickets with no migration required.
- Multi-tenant: each customer organisation is logically isolated; one tenant cannot access another's data.

## <a name="_toc225254646"></a>**12.3 Availability & Reliability**
- Target uptime: 99.9% (< 8.7 hours downtime per year), excluding planned maintenance.
- Planned maintenance: Sundays 2 AM – 4 AM IST, with 48-hour advance notice.
- Recovery Time Objective (RTO): 1 hour for P1 system incidents.
- Recovery Point Objective (RPO): 15 minutes (continuous replication + hourly backups).

## <a name="_toc225254647"></a>**12.4 Security**
- All data encrypted in transit (TLS 1.3) and at rest (AES-256).
- Authentication: SSO (SAML 2.0), OAuth 2.0, or email + OTP. No permanent passwords for customers.
- Role-based access control enforced server-side on every API call.
- PII fields (salary data, bank account details) masked in logs, exports, and audit records.
- Full audit log of all user actions retained for 24 months.
- VAPT (Vulnerability Assessment and Penetration Testing) conducted before go-live and annually thereafter.

## <a name="_toc225254648"></a>**12.5 Compliance**
- DPDP Act 2023 (India) compliant: lawful basis for processing, data minimisation, and right to erasure.
- Data residency: all production data stored in Indian data centres (AWS Mumbai ap-south-1 or equivalent).
- Customer data deletion processed within 30 days of verified termination request.

## <a name="_toc225254649"></a>**12.6 Accessibility**
- Customer portal: WCAG 2.1 Level AA compliant.
- Keyboard-navigable interface throughout; screen-reader compatible (ARIA labels on all interactive elements).
- Minimum contrast ratio of 4.5:1 for all body text; 3:1 for large text and UI components.



|<p>**CHAPTER 13**</p><p>**Implementation Roadmap**</p>|
| :- |

# <a name="_toc225254650"></a>**13. Implementation Roadmap**

The ETS is delivered in five sequential phases. Each phase is independently usable and delivers tangible value before the next phase begins.

|**Phase**|**Name**|**Timeline**|**Key Deliverables**|
| :- | :- | :- | :- |
|1|Foundation|Months 1–2|Core ticket CRUD, product categories, agent workspace, email-to-ticket, RBAC, email notifications, Chat Widget (in-app ticket creation)|
|2|SLA & Escalation|Month 3|SLA policy engine, breach detection, L1/L2/L3 escalation workflow, SLA dashboard|
|3|Self-Service Portal|Month 4|Customer portal, ticket tracking, conversation thread, CSAT survey, announcements banner|
|4|Reporting & Analytics|Months 5–6|All standard reports, custom report builder, management dashboard, scheduled report delivery|
|5|Advanced Capabilities|Month 7+|AI ticket classification, WhatsApp notifications, predictive SLA breach alerts, mobile optimisation|

## <a name="_toc225254651"></a>**13.1 Phase 1 — Foundation (Months 1–2)**
- Core ticket CRUD: create, view, update, and close tickets with all standard fields.
- Chat Widget: floating FAB embedded across all Ezii modules; full ticket creation including attachments; context metadata passing; My Tickets list and ticket detail view within widget.
- Product taxonomy: all four products with default categories and sub-categories.
- Basic agent workspace: queue view, ticket detail, reply composer, internal notes.
- Email-to-ticket ingestion: one inbound address per product; reply threading.
- Role-based access control: Customer, L1 Agent, Team Lead, System Admin.
- Email and in-app notifications for core lifecycle events.

## <a name="_toc225254652"></a>**13.2 Phase 2 — SLA & Escalation (Month 3)**
- SLA policy engine: P1–P4 tiers, business hours, and holiday calendar integration.
- SLA timer on every ticket; breach warning at 75%; auto-escalation on breach.
- L1/L2/L3 escalation workflow with structured handoff note form.
- Keyword-based P1 auto-escalation on ticket creation.
- SLA real-time dashboard for Team Leads.

## <a name="_toc225254653"></a>**13.3 Phase 3 — Self-Service Portal (Month 4)**
- Customer portal: ticket creation, status tracking, conversation thread, and file attachments.
- SSO and OTP authentication for customers.
- CSAT survey on resolution; low-CSAT alert to Team Lead.
- Announcements banner for service notices.

## <a name="_toc225254654"></a>**13.4 Phase 4 — Reporting & Analytics (Months 5–6)**
- All six standard reports (daily digest, weekly summary, monthly executive, SLA compliance, agent performance, KB effectiveness).
- Custom report builder with drag-and-drop columns, grouping, and scheduling.
- Management and executive dashboard with all widgets from Section 8.3.
- Agent and Team Lead dashboards with all widgets from Sections 8.1 and 8.2.

## <a name="_toc225254655"></a>**13.5 Phase 5 — Advanced Capabilities (Month 7+)**
- AI-powered ticket classification: auto-suggest category, sub-category, and priority from the ticket description.
- AI canned response suggestions: surface the most relevant canned response based on ticket context.
- WhatsApp Business API: opt-in customer notifications for status updates and resolution.
- Predictive SLA breach alerts: ML model flags tickets likely to breach before the 75% threshold.
- Mobile-responsive portal optimisation and progressive web app (PWA) support.



|<p>**CHAPTER 14**</p><p>**Risks & Open Questions**</p>|
| :- |

# <a name="_toc225254656"></a>**14. Risks & Open Questions**

## <a name="_toc225254657"></a>**14.1 Risk Register**

|**Risk**|**Likelihood**|**Impact**|**Mitigation**|
| :- | :- | :- | :- |
|Adoption resistance from support team|Medium|High|Involve agents in design sprints; run champion agent programme; provide training|
|Admins setting SLAs that engineering cannot honour|Medium|High|Two-tier model: Tier 1 configurable within bounds; Tier 2 hardcoded by Ezii — customers cannot influence internal engineering timers|
|Scope creep delaying Phase 1|High|High|Strict MVP scope gate; fortnightly sprint reviews with product and engineering leads|
|Email threading failures (mis-matched threads)|Medium|Medium|Email fingerprinting + ticket ID in subject; fallback to new ticket creation|
|Security breach exposing payroll PII|Low|Critical|AES-256 at rest, TLS 1.3 in transit, PII masking, VAPT pre-launch, quarterly audits|
|Data migration from legacy email threads|Low|Low|Optional import tool; not blocking go-live; historical data remains in email|

## <a name="_toc225254658"></a>**14.2 Open Questions**

|**#**|**Question**|**Owner**|**Needed By**|**Status**|
| :- | :- | :- | :- | :- |
|Q1|Should SLA policies be configurable per customer organisation in v1.0? Resolved: two-tier model adopted — Tier 1 (customer-facing) is configurable within bounds; Tier 2 (internal Ezii) is hardcoded.|Product Lead|Apr 2026|Resolved|
|Q2|What is the expected steady-state ticket volume per product per day? (Drives infrastructure and queue sizing)|Support Ops|Apr 2026|Open|
|Q3|Will the customer portal require Hindi or other regional language support at launch?|Product Lead|Apr 2026|Open|
|Q4|Should agents be able to merge duplicate tickets, and if so, how should SLA be handled for the surviving ticket?|Support Lead|May 2026|Open|
|Q5|What is the agreed data retention period for closed tickets? (Impacts storage architecture and cost estimates)|Legal / CTO|Apr 2026|Open|
|Q6|Should ticket IDs be globally unique (EZI-00123) or product-prefixed (PAY-00123)? Product-prefixed is proposed.|Product Lead|Apr 2026|Open|
|Q7|Is there a requirement to support multi-org customers (one company with multiple Ezii tenant accounts)?|Sales / Product|May 2026|Open|



|<p>**CHAPTER 15**</p><p>**Glossary**</p>|
| :- |

# <a name="_toc225254659"></a>**15. Glossary**

|**Term**|**Definition**|
| :- | :- |
|Chat Widget|A floating in-app panel embedded in the Ezii application that allows customers to raise and manage support tickets from any screen without navigating away|
|Context Metadata|Diagnostic information (e.g., payroll period, employee ID, screen state) automatically attached to a ticket when it is raised via the Chat Widget|
|DPDP Act|Digital Personal Data Protection Act 2023 (India) — governs collection and use of personal data|
|Deflection|A ticket that was not submitted because the customer found an answer in the knowledge base|
|ETS|Ezii Ticketing System — the product defined in this document|
|L1 / L2 / L3|Support tier levels: L1 Frontline Agent / L2 Product Specialist / L3 Engineering|
|MTTR|Mean Time to Resolution — average time from ticket creation to Closed status|
|OOO|Out of Office — agent availability mode that auto-redistributes their tickets|
|PRD|Product Requirements Document — this document|
|RBAC|Role-Based Access Control — access permissions determined by the user's assigned role|
|RPO|Recovery Point Objective — maximum acceptable data loss window (15 minutes for ETS)|
|RTO|Recovery Time Objective — maximum acceptable downtime following an incident (1 hour for P1)|
|SLA — Tier 1|Customer-facing SLA: committed first-response and resolution targets visible to clients; configurable by Ezii Admins within defined bounds|
|SLA — Tier 2|Internal Ezii SLA: hardcoded response and resolution targets for L2 and L3 engineering work; not visible or configurable by customers or customer admins|
|SSO|Single Sign-On — federated authentication allowing login with an existing identity provider|
|VAPT|Vulnerability Assessment and Penetration Testing — mandatory security review before go-live|
|Webhook|An HTTP callback sent by ETS to an external URL when a specified event occurs|



*End of Document  —  Ezii Ticketing System PRD v1.0  |  March 2026*
Confidential  |  Page 19 of 51
