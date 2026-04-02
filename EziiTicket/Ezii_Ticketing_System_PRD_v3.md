**EZII**

Internal Ticketing System

|                                   |
|:---------------------------------:|
| **Product Requirements Document** |

*Version 1.0 \| March 2026 \| Confidential*

<table>
<colgroup>
<col style="width: 27%" />
<col style="width: 72%" />
</colgroup>
<tbody>
<tr>
<td colspan="2"><strong>Document Information</strong></td>
</tr>
<tr>
<td><strong>Product</strong></td>
<td>EZII Ticketing System (ETS)</td>
</tr>
<tr>
<td><strong>Author</strong></td>
<td>Product Team</td>
</tr>
<tr>
<td><strong>Status</strong></td>
<td>Draft — For Internal Review</td>
</tr>
<tr>
<td><strong>Date</strong></td>
<td>March 16, 2026</td>
</tr>
<tr>
<td><strong>Version</strong></td>
<td>1.0</td>
</tr>
<tr>
<td><strong>Products</strong></td>
<td>Payroll | Leave | Attendance | Expense</td>
</tr>
</tbody>
</table>

# Table of Contents

[Table of Contents [2](#table-of-contents)](#table-of-contents)

[1. Overview [6](#overview)](#overview)

[1.1 Purpose [6](#purpose)](#purpose)

[1.2 Problems Being Solved
[6](#problems-being-solved)](#problems-being-solved)

[1.3 Goals [6](#goals)](#goals)

[1.4 Success Metrics [7](#success-metrics)](#success-metrics)

[1.5 Scope Summary [7](#scope-summary)](#scope-summary)

[2. User Personas [8](#user-personas)](#user-personas)

[2.1 Customer (End User) [8](#customer-end-user)](#customer-end-user)

[2.2 L1 Support Agent [8](#l1-support-agent)](#l1-support-agent)

[2.3 L2 Product Specialist
[8](#l2-product-specialist)](#l2-product-specialist)

[2.4 Support Team Lead [9](#support-team-lead)](#support-team-lead)

[2.5 System Administrator
[9](#system-administrator)](#system-administrator)

[3. System Setup & Configuration
[10](#system-setup-configuration)](#system-setup-configuration)

[3.1 Organisation & Product Setup
[10](#organization-product-setup)](#organization-product-setup)

[3.1.1 Organisation Profile
[10](#organization-profile)](#organization-profile)

[3.1.2 Product Enablement
[10](#product-enablement)](#product-enablement)

[3.2 Ticket Category Configuration
[10](#ticket-category-configuration)](#ticket-category-configuration)

[3.2.1 Payroll — Default Categories
[10](#payroll-default-categories)](#payroll-default-categories)

[3.2.2 Leave — Default Categories
[11](#leave-default-categories)](#leave-default-categories)

[3.2.3 Attendance — Default Categories
[11](#attendance-default-categories)](#attendance-default-categories)

[3.2.4 Expense — Default Categories
[11](#expense-default-categories)](#expense-default-categories)

[3.3 SLA Policy Engine [12](#sla-policy-engine)](#sla-policy-engine)

[3.3.1 Tier 1 — Customer-Facing SLA (Configurable)
[12](#tier-1-customer-facing-sla-configurable)](#tier-1-customer-facing-sla-configurable)

[3.3.2 Tier 2 — Internal Ezii SLA (Non-Configurable)
[13](#tier-2-internal-ezii-sla-non-configurable)](#tier-2-internal-ezii-sla-non-configurable)

[3.3.3 Customer Admin SLA Configuration Bounds
[13](#customer-admin-sla-configuration-bounds)](#customer-admin-sla-configuration-bounds)

[3.3.4 SLA Calculation Rules
[14](#sla-calculation-rules)](#sla-calculation-rules)

[3.3.5 Keyword Auto-Escalation
[14](#keyword-auto-escalation)](#keyword-auto-escalation)

[3.4 Routing & Assignment Rules
[14](#routing-assignment-rules)](#routing-assignment-rules)

[3.4.1 Rule Conditions [15](#rule-conditions)](#rule-conditions)

[3.4.2 Rule Actions [15](#rule-actions)](#rule-actions)

[3.5 User & Role Management
[15](#user-role-management)](#user-role-management)

[3.6 Notification Templates
[15](#notification-templates)](#notification-templates)

[4. Chat Widget — In-App Ticket Creation
[17](#chat-widget-in-app-ticket-creation)](#chat-widget-in-app-ticket-creation)

[4.1 Widget Availability & Placement
[17](#widget-availability-placement)](#widget-availability-placement)

[4.2 Widget States [17](#widget-states)](#widget-states)

[4.3 New Ticket Creation Flow
[18](#new-ticket-creation-flow)](#new-ticket-creation-flow)

[4.3.1 Step-by-Step Flow [18](#step-by-step-flow)](#step-by-step-flow)

[4.3.2 Field Behaviour in the Widget
[18](#field-behaviour-in-the-widget)](#field-behaviour-in-the-widget)

[4.3.3 Draft Persistence [19](#draft-persistence)](#draft-persistence)

[4.4 Viewing & Updating Tickets in the Widget
[19](#viewing-updating-tickets-in-the-widget)](#viewing-updating-tickets-in-the-widget)

[4.4.1 My Tickets List [19](#my-tickets-list)](#my-tickets-list)

[4.4.2 Ticket Detail in Widget
[19](#ticket-detail-in-widget)](#ticket-detail-in-widget)

[4.5 Widget — Technical & UX Specifications
[20](#widget-technical-ux-specifications)](#widget-technical-ux-specifications)

[4.5.1 Rendering [20](#rendering)](#rendering)

[4.5.2 Performance [20](#performance)](#performance)

[4.5.3 Accessibility [20](#accessibility)](#accessibility)

[4.5.4 Context Passing [20](#context-passing)](#context-passing)

[4.6 Widget Behaviour by Role
[21](#widget-behaviour-by-role)](#widget-behaviour-by-role)

[4.7 Widget Configuration (Admin)
[21](#widget-configuration-admin)](#widget-configuration-admin)

[5. Employee & Customer Processes
[22](#employee-customer-processes)](#employee-customer-processes)

[5.1 Ticket Creation Channels
[22](#ticket-creation-channels)](#ticket-creation-channels)

[5.2 Self-Service Portal
[23](#self-service-portal)](#self-service-portal)

[5.2.1 Authentication [23](#authentication)](#authentication)

[5.2.2 Portal Home [23](#portal-home)](#portal-home)

[5.3 Ticket Fields Reference
[23](#ticket-fields-reference)](#ticket-fields-reference)

[5.4 Tracking a Ticket [23](#tracking-a-ticket)](#tracking-a-ticket)

[5.4.1 Ticket List View [23](#ticket-list-view)](#ticket-list-view)

[5.4.2 Ticket Detail View (Customer)
[23](#ticket-detail-view-customer)](#ticket-detail-view-customer)

[5.5 Notifications & Communication
[24](#notifications-communication)](#notifications-communication)

[5.6 Resolution & CSAT Survey
[24](#resolution-csat-survey)](#resolution-csat-survey)

[6. Agent Processes [25](#agent-processes)](#agent-processes)

[6.1 Ticket Lifecycle [25](#ticket-lifecycle)](#ticket-lifecycle)

[6.2 Agent Workspace [25](#agent-workspace)](#agent-workspace)

[5.2.1 Queue Views [25](#queue-views)](#queue-views)

[5.2.2 List View Controls
[26](#list-view-controls)](#list-view-controls)

[6.3 Working a Ticket [26](#working-a-ticket)](#working-a-ticket)

[5.3.1 Ticket Detail View (Agent)
[26](#ticket-detail-view-agent)](#ticket-detail-view-agent)

[5.3.2 Replying to a Customer
[26](#replying-to-a-customer)](#replying-to-a-customer)

[6.4 Escalation Workflows
[26](#escalation-workflows)](#escalation-workflows)

[5.4.1 Support Tier Model
[26](#support-tier-model)](#support-tier-model)

[5.4.2 Escalation Triggers
[27](#escalation-triggers)](#escalation-triggers)

[5.4.3 Escalation Handoff Standard
[27](#escalation-handoff-standard)](#escalation-handoff-standard)

[7. Admin Processes [28](#admin-processes)](#admin-processes)

[7.1 Admin Panel Overview
[28](#admin-panel-overview)](#admin-panel-overview)

[6.2 User Lifecycle Management
[28](#user-lifecycle-management)](#user-lifecycle-management)

[6.2.1 Onboarding an Agent
[28](#onboarding-an-agent)](#onboarding-an-agent)

[6.2.2 Offboarding an Agent
[29](#offboarding-an-agent)](#offboarding-an-agent)

[6.2.3 Managing Customer Org Admins
[29](#managing-customer-org-admins)](#managing-customer-org-admins)

[7.3 Queue & Workload Management
[29](#queue-workload-management)](#queue-workload-management)

[7.4 Custom Fields [29](#custom-fields)](#custom-fields)

[7.5 Audit & Compliance [29](#audit-compliance)](#audit-compliance)

[6.5.1 Ticket Audit Trail
[30](#ticket-audit-trail)](#ticket-audit-trail)

[6.5.2 Admin Audit Log [30](#admin-audit-log)](#admin-audit-log)

[6.5.3 Data Retention & Deletion
[30](#data-retention-deletion)](#data-retention-deletion)

[8. Notifications & Communications
[31](#notifications-communications)](#notifications-communications)

[8.1 Notification Matrix
[31](#notification-matrix)](#notification-matrix)

[8.2 Email-to-Ticket [31](#email-to-ticket)](#email-to-ticket)

[8.3 Notification Preferences
[32](#notification-preferences)](#notification-preferences)

[9. Dashboards [33](#dashboards)](#dashboards)

[9.1 Agent Dashboard [33](#agent-dashboard)](#agent-dashboard)

[9.2 Team Lead Dashboard
[33](#team-lead-dashboard)](#team-lead-dashboard)

[9.3 Management / Executive Dashboard
[34](#management-executive-dashboard)](#management-executive-dashboard)

[9.4 Customer Dashboard (Portal Home)
[34](#customer-dashboard-portal-home)](#customer-dashboard-portal-home)

[10. Reports [35](#reports)](#reports)

[10.1 Standard Reports [35](#standard-reports)](#standard-reports)

[9.1.1 Daily Operations Digest
[35](#daily-operations-digest)](#daily-operations-digest)

[9.1.2 Weekly Performance Summary
[35](#weekly-performance-summary)](#weekly-performance-summary)

[9.1.3 Monthly Executive Report
[35](#monthly-executive-report)](#monthly-executive-report)

[9.1.4 SLA Compliance Report
[36](#sla-compliance-report)](#sla-compliance-report)

[9.1.5 Agent Performance Report
[36](#agent-performance-report)](#agent-performance-report)

[10.2 Custom Report Builder
[36](#custom-report-builder)](#custom-report-builder)

[10.3 Data Access & Permissions
[36](#data-access-permissions)](#data-access-permissions)

[11. Non-Functional Requirements
[38](#non-functional-requirements)](#non-functional-requirements)

[11.1 Performance [38](#performance-1)](#performance-1)

[11.2 Scalability [38](#scalability)](#scalability)

[11.3 Availability & Reliability
[38](#availability-reliability)](#availability-reliability)

[11.4 Security [38](#security)](#security)

[11.5 Compliance [39](#compliance)](#compliance)

[11.6 Accessibility [39](#accessibility-1)](#accessibility-1)

[12. Implementation Roadmap
[40](#implementation-roadmap)](#implementation-roadmap)

[12.1 Phase 1 — Foundation (Months 1–2)
[40](#phase-1-foundation-months-12)](#phase-1-foundation-months-12)

[12.2 Phase 2 — SLA & Escalation (Month 3)
[40](#phase-2-sla-escalation-month-3)](#phase-2-sla-escalation-month-3)

[12.3 Phase 3 — Self-Service Portal (Month 4)
[41](#phase-3-self-service-portal-month-4)](#phase-3-self-service-portal-month-4)

[12.4 Phase 4 — Reporting & Analytics (Months 5–6)
[41](#phase-4-reporting-analytics-months-56)](#phase-4-reporting-analytics-months-56)

[12.5 Phase 5 — Advanced Capabilities (Month 7+)
[41](#phase-5-advanced-capabilities-month-7)](#phase-5-advanced-capabilities-month-7)

[13. Risks & Open Questions
[42](#risks-open-questions)](#risks-open-questions)

[13.1 Risk Register [42](#risk-register)](#risk-register)

[13.2 Open Questions [42](#open-questions)](#open-questions)

[14. Glossary [44](#glossary)](#glossary)

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 1</strong></p>
<p><strong>Overview</strong></p></td>
</tr>
</tbody>
</table>

# 1. Overview

## 1.1 Purpose

Ezii is a modern HR and workforce management platform with four core
product lines: Payroll, Leave, Attendance, and Expense. As the platform
and its customer base grow, support and issue management has become
fragmented — teams rely on a patchwork of emails, spreadsheets, and
informal messaging to handle customer requests.

The Ezii Ticketing System (ETS) is a purpose-built, ServiceNow-inspired
issue management platform designed for Ezii's operational teams and
customers. It provides a single place to raise, track, triage, and
resolve issues across all four product lines — with consistent SLAs,
structured escalation, and actionable reporting.

## 1.2 Problems Being Solved

|  |  |  |
|----|----|----|
| **Problem** | **Current State** | **With ETS** |
| No unified inbox | Requests arrive via email, WhatsApp, Slack — siloed per team | Single portal and agent workspace across all products |
| No SLA enforcement | Response times are unmeasured and inconsistent | Automated SLA timers, breach alerts, and escalation |
| No self-service | Every query requires an agent; high L1 volume | Customer portal to raise, track, and manage tickets without calling support |
| No cross-product visibility | Issues are handled in silos with no linked view | Shared platform with product filters and linked tickets |
| No reporting | Manual, lagged, and inaccurate data | Real-time dashboards and scheduled reports |

## 1.3 Goals

1.  Provide a single ticketing platform across Payroll, Leave,
    Attendance, and Expense.

2.  Enforce SLA targets with automated escalation and breach
    notifications.

3.  Enable customer self-service through a branded portal with ticket
    tracking and status updates.

4.  Support a structured three-tier support model: L1 → L2 → L3.

5.  Give managers real-time visibility into team performance and SLA
    health.

## 1.4 Success Metrics

|  |  |  |  |
|----|----|----|----|
| **Metric** | **Today** | **6-Month Target** | **12-Month Target** |
| Avg. First Response Time | \> 8 hours | \< 4 hours | \< 2 hours |
| SLA Breach Rate | Unmeasured | \< 20% | \< 10% |
| Self-service Resolution Rate | 0% | 15% | 30% |
| Customer Satisfaction (CSAT) | Not tracked | \> 3.5 / 5 | \> 4.2 / 5 |
| Mean Time to Resolution (MTTR) | Unmeasured | \< 3 business days | \< 1.5 business days |
| L1 → L2 Escalation Rate | Unmeasured | \< 40% | \< 25% |

## 1.5 Scope Summary

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>In Scope — v1.0</strong></p>
<ul>
<li><p>In-app Chat Widget: floating ticket creation available on every
screen of the Ezii application, with context-aware pre-fill and full
attachment support</p></li>
<li><p>Unified ticket creation, assignment, and lifecycle management
across all 4 products</p></li>
<li><p>Product-specific ticket categories (Payroll, Leave, Attendance,
Expense)</p></li>
<li><p>SLA policy engine with P1–P4 priority tiers and business-hours
calendars</p></li>
<li><p>Customer self-service portal (web) with ticket tracking and
status updates</p></li>
<li><p>Internal agent workspace with queue management and collaboration
tools</p></li>
<li><p>Three-tier escalation model (L1 frontline / L2 product specialist
/ L3 engineering)</p></li>
<li><p>Role-based access control: Admin, Agent, Team Lead,
Customer</p></li>
<li><p>Real-time dashboards and scheduled reports</p></li>
<li><p>Email and in-app notifications</p></li>
<li><p>Audit trail for all ticket state changes</p></li>
</ul></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Out of Scope — v1.0</strong></p>
<ul>
<li><p>AI-powered auto-resolution or chatbot (planned v2.0)</p></li>
<li><p>Native mobile application (web-responsive only)</p></li>
<li><p>Integration with external ITSM tools (ServiceNow, Jira,
Zendesk)</p></li>
<li><p>WhatsApp Business API (planned v2.0)</p></li>
<li><p>Billing, invoicing, or asset management workflows</p></li>
</ul></td>
</tr>
</tbody>
</table>

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 2</strong></p>
<p><strong>User Personas</strong></p></td>
</tr>
</tbody>
</table>

# 2. User Personas

ETS serves five distinct user types. Understanding their goals and pain
points drives every design and workflow decision in this document.

## 2.1 Customer (End User)

|  |  |
|----|----|
| **Who** | HR Manager, Finance Manager, or Employee at a company using Ezii |
| **Goal** | Raise an issue quickly, track its progress without chasing, and get a resolution with clear next steps |
| **Pain Today** | No visibility into progress; must send follow-up emails; doesn't know who owns the issue |
| **Key Needs** | Simple ticket form; real-time status tracking; notification on every update; self-serve resolution for common issues |

## 2.2 L1 Support Agent

|  |  |
|----|----|
| **Who** | Ezii frontline support agent handling first-contact tickets across all products |
| **Goal** | Triage and resolve tickets efficiently; hit SLA targets; escalate clearly when needed |
| **Pain Today** | Juggling email, Slack, and spreadsheets; no SLA visibility; no canned responses; duplicate work |
| **Key Needs** | Single queue view; SLA countdown on every ticket; canned response library; one-click escalation |

## 2.3 L2 Product Specialist

|  |  |
|----|----|
| **Who** | Functional expert for one or more Ezii products (e.g., Payroll Specialist, Leave Specialist) |
| **Goal** | Receive escalated tickets with full context; diagnose complex issues; coordinate with engineering if needed |
| **Pain Today** | Escalated tickets arrive without history or reproduction steps; no standard handoff format |
| **Key Needs** | Full ticket history on escalation; internal notes for context; ability to loop in L3; structured resolution template |

## 2.4 Support Team Lead

|  |  |
|----|----|
| **Who** | Manages one or more support agents; accountable for team SLA and quality |
| **Goal** | Monitor team performance in real time; intervene before SLA breaches; identify training gaps |
| **Pain Today** | No real-time data; weekly manual reports; can't see SLA risk before breach occurs |
| **Key Needs** | Live SLA dashboard; agent workload view; breach warning alerts; trend reports by product |

## 2.5 System Administrator

|  |  |
|----|----|
| **Who** | Ezii platform admin responsible for configuring and maintaining ETS |
| **Goal** | Set up products, workflows, SLA policies, and user roles without writing code |
| **Pain Today** | Any workflow change requires an engineering sprint; no self-serve configuration panel |
| **Key Needs** | Visual admin panel; drag-and-drop workflow editor; SLA policy builder; audit log of config changes |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 3</strong></p>
<p><strong>System Setup &amp; Configuration</strong></p></td>
</tr>
</tbody>
</table>

# 3. System Setup & Configuration

Before tickets can flow, an Administrator must configure the
foundational elements of ETS. This chapter covers everything needed to
go from a blank installation to a fully operational system.

## 3.1 Organization & Product Setup

### 3.1.1 Organization Profile

- Organization name, logo, support email address, and timezone.

- Business hours definition: default Monday–Friday, 9 AM – 6 PM IST
  (configurable per org).

- Public holiday calendar: import national/state holidays or define
  custom dates.

- Customer portal URL: custom subdomain (e.g.,
  support.ezii.com/\[org-name\]).

### 3.1.2 Product Enablement

Each of the four Ezii products can be independently enabled or disabled
for ticketing. When a product is enabled, its category taxonomy becomes
available for ticket creation.

|  |  |  |  |
|----|----|----|----|
| **Product** | **Default Ticket Prefix** | **Default Routing Queue** | **Can Be Disabled?** |
| Payroll | PAY- | Payroll Support Queue | Yes — hides from portal and agent view |
| Leave | LEA- | Leave Support Queue | Yes |
| Attendance | ATT- | Attendance Support Queue | Yes |
| Expense | EXP- | Expense Support Queue | Yes |

## 3.2 Ticket Category Configuration

Categories define how tickets are classified within each product. They
drive routing, SLA assignment, and reporting granularity. Categories are
managed in the Admin Panel under each product.

### 3.2.1 Payroll — Default Categories

|  |  |
|----|----|
| **Category** | **Sub-categories** |
| Salary Discrepancy | Gross pay incorrect \| Deductions mismatch \| Arrears not processed |
| Tax & Compliance | TDS computation error \| Form 16 issue \| PF/ESI mismatch |
| Payslip | Not generated \| Incorrect data \| Download failure |
| Bank Transfer | Salary not credited \| Wrong account \| Partial transfer |
| Payroll Run | Run failed \| Incorrect period \| Revision request |
| Configuration | New employee setup \| Grade / band change \| Component addition |
| Statutory Reports | MIS report error \| Statutory report \| Export failure |

### 3.2.2 Leave — Default Categories

|  |  |
|----|----|
| **Category** | **Sub-categories** |
| Leave Application | Cannot apply \| Duplicate application \| Unable to cancel |
| Leave Balance | Incorrect balance \| Carry-forward issue \| Encashment error |
| Leave Policy | Policy not applied \| Entitlement mismatch \| Exception request |
| Approval Workflow | Approver not notified \| Auto-rejected \| Delegation issue |
| Holiday Calendar | Wrong holiday listed \| Restricted holiday \| State-specific holiday |
| Compensatory Off | Compoff not credited \| Expired compoff \| Application rejected |
| Reporting | Leave report incorrect \| Balance summary wrong \| Export failure |

### 3.2.3 Attendance — Default Categories

|  |  |
|----|----|
| **Category** | **Sub-categories** |
| Punch In / Out | Missed punch \| Duplicate punch \| Biometric failure |
| Regularization | Regularization rejected \| Missing approval \| Period already closed |
| Shift Management | Wrong shift assigned \| Roster not updated \| Night shift issue |
| Overtime | OT not calculated \| OT rate incorrect \| Approval pending |
| Work From Home | WFH not marked \| Location tracking issue \| Policy mismatch |
| Device & Integration | Biometric device offline \| Mobile app issue \| GPS failure |
| Reporting | Attendance summary wrong \| Report mismatch \| Export issue |

### 3.2.4 Expense — Default Categories

|  |  |
|----|----|
| **Category** | **Sub-categories** |
| Claim Submission | Cannot submit claim \| Attachment issue \| Category not available |
| Approval Workflow | Approver not notified \| Claim auto-rejected \| Delegation issue |
| Reimbursement | Not reimbursed \| Partial reimbursement \| Wrong account credited |
| Policy Violation | Over policy limit \| Missing receipt \| Category mismatch |
| Travel Advance | Advance not released \| Incorrect amount \| Settlement pending |
| Receipt Management | OCR scan failure \| Receipt not attached \| Duplicate receipt |
| Reporting | Expense report incorrect \| Budget variance \| Export failure |

All categories and sub-categories above are defaults. Administrators can
add, rename, or disable any category without engineering involvement.

## 3.3 SLA Policy Engine

ETS operates a two-tier SLA model. Customer-facing SLAs (Tier 1) can be
configured by Ezii Admins per organization. Internal Ezii SLAs (Tier 2)
govern L2 and L3 engineering work and are hard-coded by Ezii — no
customer admin or organization can view or modify them.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Why two tiers?</strong></p>
<ul>
<li><p>L1 tickets are customer-visible interactions — response time
expectations are a commercial relationship between Ezii and the
client.</p></li>
<li><p>L2 and L3 tickets involve Ezii's internal engineering and product
teams. Allowing clients to set these timers would let a single customer
monopolise engineering capacity or create unrealistic SLA obligations
that Ezii cannot honour at scale.</p></li>
<li><p>Clients see that their ticket has been escalated internally and
will receive updates, but they do not see or influence the internal
resolution clock.</p></li>
</ul></td>
</tr>
</tbody>
</table>

### 3.3.1 Tier 1 — Customer-Facing SLA (Configurable)

Tier 1 SLAs define what Ezii commits to the customer: how quickly L1
agents will first respond to and resolve a ticket. These are surfaced on
the customer portal and in customer-facing notifications. Ezii Admins
can adjust these per organization within permitted bounds (see Section
3.3.3).

|  |  |  |  |  |
|----|----|----|----|----|
| **Priority** | **Definition** | **L1 First Response** | **L1 Resolution Target** | **Visible to Customer?** |
| P1 – Critical | System-wide outage or data corruption; payroll run or compliance at risk | 30 min | 4 hours | Yes |
| P2 – High | Major feature broken; significant users impacted; no workaround | 2 hours | 1 business day | Yes |
| P3 – Medium | Feature impaired; moderate impact; workaround available | 4 hours | 3 business days | Yes |
| P4 – Low | Minor issue, cosmetic defect, general query, or enhancement request | 1 biz day | 7 business days | Yes |

### 3.3.2 Tier 2 — Internal Ezii SLA (Non-Configurable)

Tier 2 SLAs govern how quickly Ezii's L2 Product Specialists and L3
Engineering teams must act once a ticket is escalated to them. These
timers are set by Ezii, hardcoded in the system, and are not exposed to
customers or customer admins in any form.

|  |  |  |  |  |
|----|----|----|----|----|
| **Priority** | **L2 Acknowledgement** | **L2 Resolution / Pass to L3** | **L3 Acknowledgement** | **L3 Resolution Target** |
| P1 – Critical | 15 min | 2 hours | 30 min | 4 hours |
| P2 – High | 1 hour | 4 business hours | 2 hours | 1 business day |
| P3 – Medium | 4 hours | 2 business days | 1 biz day | 3 business days |
| P4 – Low | 1 biz day | 5 business days | 2 biz day | 7 business days |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Tier 2 SLA Rules</strong></p>
<ul>
<li><p>Tier 2 timers start the moment a ticket is escalated to L2 or L3
— independent of Tier 1 timers.</p></li>
<li><p>Tier 2 SLA data appears only in internal dashboards and reports
visible to Ezii agents, Team Leads, and Admins.</p></li>
<li><p>Customers receive status updates at defined milestones (e.g.,
'Your ticket has been escalated to our specialist team') but are not
shown Tier 2 timer values or deadlines.</p></li>
<li><p>Breaching a Tier 2 SLA triggers an internal alert to the Ezii
Team Lead and escalates to the relevant engineering manager — it does
not generate a customer-facing notification.</p></li>
<li><p>Tier 2 SLA values can only be changed by the Ezii System Admin
through a restricted configuration panel — they are not accessible via
the standard Admin Panel available to customer organizations.</p></li>
</ul></td>
</tr>
</tbody>
</table>

### 3.3.3 Customer Admin SLA Configuration Bounds

Ezii Admins can adjust Tier 1 SLA targets for specific customer
organizations, subject to the following guardrails. These bounds exist
to prevent commercial commitments that Ezii cannot operationally
deliver.

|  |  |  |  |  |
|----|----|----|----|----|
| **Priority** | **Min First Response** | **Max First Response** | **Min Resolution** | **Max Resolution** |
| P1 – Critical | 15 min (floor) | 1 hour (ceiling) | 2 hours (floor) | 8 hours (ceiling) |
| P2 – High | 1 hour (floor) | 4 hours (ceiling) | 4 biz hours (floor) | 2 business days (ceiling) |
| P3 – Medium | 2 hours (floor) | 8 hours (ceiling) | 1 biz day (floor) | 5 business days (ceiling) |
| P4 – Low | 4 hours (floor) | 2 biz days (ceiling) | 3 biz days (floor) | 14 business days (ceiling) |

- If an Ezii Admin attempts to set a Tier 1 SLA value outside the
  permitted bounds, the system rejects the input and displays the
  allowed range.

- All Tier 1 SLA overrides are recorded in the Admin Audit Log with
  before/after values and the acting admin's identity.

- Tier 1 SLA values cannot be set more aggressively than the
  corresponding Tier 2 values — this prevents a scenario where the
  customer's resolution expectation is faster than Ezii's own internal
  engineering target.

### 3.3.4 SLA Calculation Rules

- Tier 1 timer starts the moment a ticket is created (status = New).

- Tier 2 timer starts the moment a ticket status changes to Escalated.

- Both timers pause independently when the respective ticket is in
  Pending status.

- Timers resume when a customer or agent responds, or when Pending
  duration exceeds 48 hours.

- Business hours apply to both tiers; public holidays are excluded
  automatically.

- Breach warning fires at 75% of elapsed SLA time for both tiers (to
  different audiences).

- On Tier 1 breach: auto-escalate ticket, notify customer's Org Admin
  and Ezii Team Lead.

- On Tier 2 breach: alert Ezii Team Lead and engineering manager — no
  customer notification.

### 3.3.5 Keyword Auto-Escalation

Administrators can define keywords that, when detected in a new ticket's
subject or description, automatically set priority to P1 and route
directly to L2 or L3. Default keywords:

|  |  |
|----|----|
| **Product** | **Trigger Keywords** |
| Payroll | salary not processed, payroll failed, wrong salary, data breach, all employees, statutory deadline |
| Leave | leave data lost, negative balance for all, carry-forward wiped, compliance audit |
| Attendance | all punches missing, biometric data loss, regularization closed for all, payroll sync failed |
| Expense | reimbursement for all, advance not disbursed, data corruption, audit requirement |

## 3.4 Routing & Assignment Rules

Routing rules determine which queue or agent a new ticket is assigned to
based on its attributes. Rules are evaluated in priority order; the
first matching rule wins.

### 3.4.1 Rule Conditions

- Product (Payroll \| Leave \| Attendance \| Expense)

- Category and sub-category

- Priority (P1–P4)

- Reporter's organization or customer tier

- Keywords in subject or description

### 3.4.2 Rule Actions

- Assign to a specific queue

- Assign to a specific agent or round-robin across a team

- Set or override priority

- Apply a specific SLA policy

- Add a tag automatically

- Send an immediate notification to a named recipient

## 3.5 User & Role Management

ETS uses Role-Based Access Control (RBAC). Roles are assigned per user;
a user can hold multiple roles.

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Role** | **Ticket Access** | **Can Assign?** | **Can Resolve?** | **Tier 1 SLA Config** | **Tier 2 SLA Config** |
| Customer | Own tickets only | No | No | No access | No access |
| Org Admin | Own organization | No | No | No access | No access |
| L1 Agent | Assigned queue | Self | Yes | No access | No access |
| L2 Specialist | Product queue + escalated | L2 queue | Yes | No access | No access |
| L3 Engineer | All tickets | Any | Yes | No access | No access |
| Team Lead | All tickets | Any | Yes | View only | View only |
| System Admin | All tickets | Any | Yes | Edit within permitted bounds | Edit (Ezii-only restricted panel) |

## 3.6 Notification Templates

Administrators can customize the content, subject, and delivery channel
for every system notification. All templates support dynamic variables
(e.g., {{ticket_id}}, {{product}}, {{agent_name}}, {{sla_deadline}}).

|  |  |  |  |
|----|----|----|----|
| **Trigger Event** | **Default Channels** | **Recipients** | **Customisable?** |
| Ticket created | Email + In-app | Reporter, assigned agent | Yes |
| Agent reply added | Email + In-app | Reporter | Yes |
| Customer reply added | Email + In-app | Assigned agent | Yes |
| Ticket status changed | Email + In-app | Reporter, agent | Yes |
| SLA warning (75%) | Email + In-app | Agent, Team Lead | Yes |
| SLA breached | Email + In-app | Agent, Team Lead, Admin | Yes |
| Ticket escalated | Email + In-app | Reporter, old agent, new agent | Yes |
| Ticket resolved | Email + In-app | Reporter (with CSAT link) | Yes |
| Ticket reopened | Email + In-app | Agent, Team Lead | Yes |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 4</strong></p>
<p><strong>Chat Widget — In-App Ticket Creation</strong></p></td>
</tr>
</tbody>
</table>

# 4. Chat Widget — In-App Ticket Creation

The Chat Widget is the primary ticket creation surface for customers. It
is a persistent, floating button available on every screen of the Ezii
application — customers never need to navigate away from their current
task to raise a support ticket. The widget opens as a side drawer or
modal and supports the full ticket creation flow, including file
attachments, without redirecting to the dedicated ticketing portal.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>Design Principle</strong></p>
<ul>
<li><p>The widget is the front door. The self-service portal (Chapter 5)
is for managing and tracking tickets after they have been raised. The
vast majority of customers will create tickets exclusively through the
widget and never visit the portal directly.</p></li>
<li><p>The widget must feel native to the Ezii application — same design
system, same fonts, no context switching.</p></li>
</ul></td>
</tr>
</tbody>
</table>

## 4.1 Widget Availability & Placement

- The widget launcher is a fixed floating action button (FAB),
  positioned in the bottom-right corner of every screen in the Ezii
  application.

- Visible across all four product modules: Payroll, Leave, Attendance,
  and Expense.

- Context-aware: the widget automatically pre-selects the Product field
  based on the module the user is currently viewing (e.g., opening the
  widget on the Leave module pre-fills Product = Leave).

- Available to all authenticated users; no additional login or
  navigation required.

- The FAB displays a notification badge showing the count of the user's
  open tickets, so they always have a live status indicator without
  opening the widget.

## 4.2 Widget States

|  |  |
|----|----|
| **State** | **What the User Sees** |
| Collapsed (default) | A circular FAB with a headset/support icon and an open ticket count badge. Single click expands the widget. |
| Expanded — Home | A compact panel showing: 'Raise a Ticket' CTA button, count of open tickets with a 'View my tickets' link, and the current system status banner if any active incident exists. |
| Expanded — New Ticket | The guided ticket creation form (see Section 4.3). Opens when the user clicks 'Raise a Ticket'. |
| Expanded — My Tickets | A scrollable list of the user's open and recently resolved tickets with status badges and one-click to view detail. |
| Expanded — Ticket Detail | A threaded conversation view for a specific ticket: full message history, status, SLA countdown, and a reply/update input field. |
| Minimized | User can minimize the expanded widget to a slim tab at the screen edge without closing it, preserving their draft. |

## 4.3 New Ticket Creation Flow

The creation form inside the widget is identical in data capture to the
portal form, but optimized for a compact, conversational layout. The
form is stepped to reduce cognitive load — users only see the fields
relevant to their current step.

### 4.3.1 Step-by-Step Flow

|  |  |  |
|----|----|----|
| **Step** | **What the User Does** | **Smart Behaviour** |
| 1 | Select Product | Pre-filled based on the active module. User can change if needed. Only enabled products are shown. |
| 2 | Select Category | Dropdown dynamically populated from the selected product's category tree. |
| 3 | Select Sub-category | Optional. Shown only after a category is selected. Skippable with a 'Not sure' option — agent will classify on receipt. |
| 4 | Enter Subject | Single-line text, max 200 characters. Placeholder text gives a prompt (e.g., 'Briefly describe the issue'). |
| 5 | Describe the Issue | Multi-line text area. Supports plain text only in the widget (full rich text available in the portal). |
| 6 | Add Attachments | Tap to upload or drag-and-drop. Max 10 files, 20 MB each. Supported: PDF, JPG, PNG, XLSX, CSV, DOCX. Preview thumbnails shown inline. |
| 7 | Review & Submit | Summary card showing all entered fields. User confirms and submits. Ticket ID shown immediately on success. |

### 4.3.2 Field Behaviour in the Widget

|  |  |  |
|----|----|----|
| **Field** | **Required?** | **Widget Behaviour** |
| Product | Yes | Auto-detected from active module; editable. Drives the category list. |
| Category | Yes | Cascading dropdown; resets sub-category if changed. |
| Sub-category | No | Optional; 'Not sure' option available. |
| Subject | Yes | Character count displayed. Submit blocked if empty. |
| Description | Yes | Min 20 characters enforced to avoid empty or uninformative tickets. |
| Attachments | No | Upload progress bar shown per file. Failed uploads flagged inline with retry option. |
| Priority | No | Not shown to the customer. Auto-assigned by routing rules on submission. |
| Affected Users | No | Hidden by default in widget; shown if product = Payroll or Attendance (higher business impact). |
| Tags | No | Hidden in widget; available in the portal detail view after submission. |

### 4.3.3 Draft Persistence

- Widget drafts are saved automatically every 10 seconds to local
  session storage.

- If the user navigates away, switches modules, or minimises the widget,
  the draft is preserved and restored when the widget is reopened.

- A 'Draft saved' indicator is shown in the widget header while a draft
  exists.

- On successful submission, the draft is cleared. On cancel, the user is
  prompted to confirm ('Discard draft?') before the draft is deleted.

## 4.4 Viewing & Updating Tickets in the Widget

After submission, customers can manage their tickets directly from the
widget without navigating to the portal. The widget supports the full
conversation lifecycle.

### 4.4.1 My Tickets List

- Displays all open and recently resolved tickets (last 30 days) for the
  logged-in user.

- Each row shows: ticket ID, product icon, subject (truncated), status
  badge, and time since last update.

- Sorted by most recently updated by default.

- Tap any row to open the Ticket Detail view within the widget.

### 4.4.2 Ticket Detail in Widget

- Full chronological conversation thread: customer messages and agent
  replies, each with sender name, timestamp, and read indicator.

- Status bar: current status and SLA countdown (e.g., 'Open — response
  due in 1h 45m').

- Reply input: customer can type a follow-up message and attach files
  directly from the widget.

- Attachments: tap any attachment to preview (images) or download
  (documents).

- 'Request Escalation' button appears after 24 hours with no agent
  update.

- 'Mark as Resolved' — if the customer considers the issue
  self-resolved, they can close the ticket from the widget.

## 4.5 Widget — Technical & UX Specifications

### 4.5.1 Rendering

- Implemented as an embedded React component injected into the Ezii
  application shell — not an iframe. This ensures it inherits the
  application's auth session, design tokens, and routing context.

- Widget width: 400px (desktop); full-screen overlay on mobile viewports
  \< 768px.

- Widget height: 600px fixed on desktop; dynamic on mobile.

- Z-index layering: widget sits above all standard application content
  but below system-level modals (e.g., session timeout warnings).

### 4.5.2 Performance

- Widget bundle size: \< 150 KB zipped to avoid impacting application
  load time.

- Widget initializes lazily — code is not downloaded until the user
  first clicks the FAB.

- Ticket list and detail data fetched on demand; not pre-loaded to avoid
  unnecessary API calls.

### 4.5.3 Accessibility

- FAB is keyboard-reachable (Tab order) with a visible focus ring.

- Widget trap focus when open (keyboard users cannot accidentally
  interact with content behind the widget).

- All form fields have associated labels; error messages are announced
  to screen readers via ARIA live regions.

- Escape key closes the widget (with draft-save prompt if a draft
  exists).

### 4.5.4 Context Passing

When the widget is opened on a specific Ezii screen, it passes
contextual metadata to the ticket on creation. This gives agents richer
diagnostic context without the customer needing to describe their
location in the app.

|  |  |
|----|----|
| **Ezii Screen** | **Context Auto-Attached to Ticket** |
| Payroll — Run Summary | Current payroll period, run status, number of employees in run |
| Payroll — Payslip View | Employee ID, payslip month, payslip reference |
| Leave — My Leaves | Employee ID, leave type currently viewed, balance snapshot |
| Leave — Approval Queue | Approver ID, leave application ID currently on screen |
| Attendance — Monthly Summary | Employee ID, month, any flagged exceptions visible on screen |
| Attendance — Regularisation | Regularisation request ID if one is open |
| Expense — Claim Form | Expense claim ID if a draft exists, expense category |
| Expense — Approval Queue | Claim ID, approver ID, claim amount |

Context metadata is visible to agents in the ticket detail view as a
collapsible 'App Context' panel. It is not shown to the customer.

## 4.6 Widget Behaviour by Role

|  |  |  |  |  |
|----|----|----|----|----|
| **Role** | **Can Create Ticket?** | **Can View Tickets?** | **Can Reply?** | **Notes** |
| Employee / Customer | Yes | Own tickets | Yes | Primary use case |
| Org Admin | Yes | Own org tickets | Yes | Can see all employees' tickets |
| L1 Agent | Yes | Assigned queue | Yes | Agent view of widget shows queue, not just own tickets |
| L2 / L3 | Yes | Escalated to them | Yes | Same as L1 Agent |
| System Admin | Yes | All tickets | Yes | Full access; can also configure widget settings |

## 4.7 Widget Configuration (Admin)

- FAB colour and icon: customisable to match the organisation's brand
  palette.

- Default position: bottom-right (default) or bottom-left, configurable
  per org.

- Greeting message: the text shown on the widget home panel is
  configurable (e.g., 'Hi Priya, how can we help?').

- Context passing: Admins can enable or disable automatic context
  metadata attachment per module.

- Widget can be temporarily disabled system-wide by a System Admin
  (e.g., during maintenance) — the FAB is hidden and replaced with a
  maintenance notice.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 5</strong></p>
<p><strong>Employee &amp; Customer Processes</strong></p></td>
</tr>
</tbody>
</table>

# 5. Employee & Customer Processes

This chapter covers every interaction a customer or employee has with
ETS — from raising a ticket to receiving a resolution and providing
feedback. For the primary ticket creation experience, see Chapter 4
(Chat Widget).

## 5.1 Ticket Creation Channels

Customers can raise tickets through three channels. All channels create
the same ticket object with the same fields and SLA rules — the channel
is recorded on the ticket for reporting purposes.

|  |  |  |
|----|----|----|
| **Channel** | **Description** | **Best For** |
| Chat Widget (primary) | Floating widget embedded in the Ezii application; context-aware; no navigation required. Full field support including attachments. See Chapter 4. | All customers; everyday use |
| Self-Service Portal | Dedicated web portal (support.ezii.com); full-featured ticket management and history. Accessible outside the Ezii application. | Viewing ticket history; raising tickets outside the app |
| Email | Inbound email to product-specific address (e.g., payroll-support@ezii.com). Subject becomes ticket subject; body becomes description. | Customers who prefer email; fallback channel |

|  |  |  |  |
|----|----|----|----|
| **Field** | **Type** | **Required** | **Notes** |
| Ticket ID | Auto-generated | Yes (system) | Format: \[PRODUCT PREFIX\]-\[5-digit number\] e.g. PAY-00123 |
| Product | Dropdown | Yes | Payroll \| Leave \| Attendance \| Expense |
| Category | Dropdown | Yes | Product-specific, see Section 3.2 |
| Sub-category | Dropdown | No | Narrows routing; shown only after category selected |
| Subject | Text (max 200) | Yes | Concise issue title |
| Description | Rich text | Yes | Full context; supports bullet points and inline images |
| Priority | Dropdown | Customer: No | Customers do not set priority; auto-calculated by routing rules |
| Attachments | File upload | No | Max 10 files, 20 MB each |
| Affected Users | Number | No | Helps agents gauge severity |
| Tags | Multi-text | No | Customer can add free-form labels |

## 5.2 Self-Service Portal

The self-service portal is a dedicated web interface for managing
tickets, viewing history, and handling account-level settings. It
complements the widget — customers who want a full-screen experience, or
who need to access ETS from outside the Ezii application, use the
portal.

### 5.2.1 Authentication

- Login via SSO (SAML 2.0 integration with the customer's identity
  provider).

- Fallback: email + OTP (6-digit, 10-minute expiry) — no separate
  password required.

- Customers only see tickets from their own organisation.

- Org Admins see all tickets raised by any employee in their
  organisation.

### 5.2.2 Portal Home

- 'Raise a Ticket' button available (mirrors the widget flow for
  consistency).

- Open tickets summary card: total open, pending customer response,
  recently resolved.

- Announcements banner: Admins can post service notices (e.g., scheduled
  maintenance).

## 5.3 Ticket Fields Reference

The following fields apply to all tickets regardless of creation channel
(widget, portal, or email).

## 5.4 Tracking a Ticket

### 5.4.1 Ticket List View

- Filterable by status, product, date range, and priority.

- Colour-coded status badges for quick visual scanning.

- SLA countdown visible for open tickets (e.g., 'Response due in 3h
  20m').

### 5.4.2 Ticket Detail View (Customer)

- Full conversation thread: all agent replies and customer updates in
  chronological order.

- Status timeline: visual progress bar showing New → Open → Resolved →
  Closed.

- File attachments: both customer-uploaded and agent-provided files
  accessible.

- Add update: customer can post a follow-up comment or upload additional
  files at any time.

- Request escalation: after 24 hours with no agent update, a 'Request
  Escalation' button becomes available.

## 5.5 Notifications & Communication

- Email notification on every key event (ticket created, agent reply,
  status change, resolution).

- In-app bell icon shows unread notification count.

- Customers can set their notification preference: all events, replies
  only, or resolution only.

- Replies to the notification email are threaded back into the ticket
  automatically.

## 5.6 Resolution & CSAT Survey

When an agent marks a ticket as Resolved, the customer receives an email
and in-app notification with:

- A summary of the resolution and any steps taken.

- A CSAT survey: single 1–5 star rating + optional open comment field.

- A 'Reopen Ticket' button available for 7 days post-resolution.

- If CSAT is 1 or 2 stars, a follow-up task is auto-created for the Team
  Lead to review.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 6</strong></p>
<p><strong>Agent Processes</strong></p></td>
</tr>
</tbody>
</table>

# 6. Agent Processes

This chapter defines the workflows, tools, and standards for L1 Support
Agents, L2 Product Specialists, and L3 Engineers as they handle tickets
within ETS.

## 6.1 Ticket Lifecycle

Every ticket moves through a defined set of statuses. The following
table describes each status, what it means, and what actions are
permitted.

|  |  |  |  |
|----|----|----|----|
| **Status** | **Meaning** | **Who Can Set** | **Valid Next Statuses** |
| New | Submitted; not yet assigned or reviewed | System (auto) | Open, Cancelled |
| Open | Assigned to an agent; under active work | Agent, Lead | Pending, Escalated, Resolved |
| Pending | Waiting for customer input or third-party action | Agent | Open, Resolved |
| Escalated | Handed off to L2 or L3 for specialist handling | Agent, Lead, System | Open, Resolved |
| Resolved | Issue addressed; resolution communicated | Agent, L2, L3 | Closed, Reopened |
| Closed | Confirmed complete; no further action | System (auto, 7 days) | Reopened |
| Cancelled | Duplicate or withdrawn by customer/agent | Agent, Customer | — |
| Reopened | Customer reported recurrence within 7 days | Customer, Agent | Open, Escalated |

## 6.2 Agent Workspace

### 6.2.1 Queue Views

- My Tickets: all tickets currently assigned to the logged-in agent.

- Team Queue: all unassigned tickets in the agent's product queues.

- SLA Risk View: tickets approaching breach, sorted by urgency.

- Escalated to Me: tickets escalated specifically to this agent or their
  tier.

- All Products: full ticket view with cross-product filters (Team Lead
  and Admin only).

### 6.2.2 List View Controls

- Sort by: created date, SLA deadline, priority, last updated.

- Filter by: product, status, priority, assignee, category, date range,
  tag.

- Bulk actions: assign, change priority, add tag, close — applied to
  selected tickets.

- Collision indicator: a presence badge warns if another agent has the
  ticket open.

## 6.3 Working a Ticket

### 6.3.1 Ticket Detail View (Agent)

- Conversation thread: full history of customer and agent messages with
  timestamps.

- Internal notes: agent-only comments (clearly marked; never visible to
  customers).

- Activity log: every status change, assignment change, and SLA event,
  with actor and timestamp.

- Linked tickets: associate related or parent-child tickets; SLA of
  parent reflects child status.

- Time tracking: log hours spent on this ticket for capacity reporting.

- Contextual customer data panel: reporter's name, organization, product
  subscription, and previous tickets.

### 6.3.2 Replying to a Customer

- Rich-text reply composer with formatting, inline images, and file
  attachments.

- Canned responses: searchable library of pre-approved reply templates
  scoped per product.

- Draft auto-save: reply drafts are saved every 30 seconds to prevent
  data loss.

- Send and set status: agent can reply and change the ticket status in a
  single action (e.g., 'Reply and set to Pending').

## 6.4 Escalation Workflows

### 6.4.1 Support Tier Model

|  |  |  |  |
|----|----|----|----|
| **Tier** | **Team** | **Handles** | **Max Hold Time** |
| L1 | Frontline Support | Initial triage, known issues, standard queries, and basic configuration guidance | Per SLA tier |
| L2 | Product Specialists | Complex functional issues, configuration problems, data anomalies, policy exceptions | Per SLA tier |
| L3 | Engineering / DevOps | Confirmed product bugs, data fixes, infrastructure incidents, security events | Per SLA tier |

### 6.4.2 Escalation Triggers

- Manual: agent selects 'Escalate' from the ticket action menu, chooses
  the target tier, and adds a mandatory handoff note.

- SLA breach: auto-escalation fires per the priority matrix defined in
  Section 3.3.1.

- Customer-initiated: customer presses 'Request Escalation' from the
  portal after 24 hours without an agent update.

- Keyword match: P1 keywords trigger immediate L2/L3 routing on ticket
  creation (see Section 3.3.3).

### 6.4.3 Escalation Handoff Standard

When escalating, the agent must complete a structured handoff note:

|  |  |  |
|----|----|----|
| **Field** | **Required?** | **Description** |
| Issue Summary | Yes | One-sentence summary of the problem |
| Steps to Reproduce | Yes (for L3) | How to replicate the issue |
| Impact | Yes | Number of users affected; business consequence |
| What Has Been Tried | Yes | Troubleshooting steps already taken |
| Target Tier | Yes | L2 or L3 selection with team or individual name |
| Escalation Reason | Yes | SLA breach \| Complexity \| Customer request \| Policy |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 7</strong></p>
<p><strong>Admin Processes</strong></p></td>
</tr>
</tbody>
</table>

# 7. Admin Processes

This chapter covers all administration workflows — managing users,
adjusting configurations, maintaining system health, and ensuring
compliance and audit readiness.

## 7.1 Admin Panel Overview

The Admin Panel is accessible only to users with the System Admin or
Team Lead role. It is a separate interface from the agent workspace.
Configuration changes made in the Admin Panel take effect immediately
(no deployment required) and are recorded in the Admin Audit Log.

|  |  |
|----|----|
| **Admin Panel Section** | **What Can Be Configured** |
| Organization | Profile, logo, business hours, holiday calendar, support email addresses |
| Products | Enable/disable products; category and sub-category management |
| SLA Policies (Tier 1) | Adjust customer-facing SLA targets per org, within Ezii-defined bounds; view Tier 2 values (read-only) |
| Routing Rules | Create and sequence auto-assignment rules |
| Users & Roles | Invite users, assign roles, deactivate accounts, manage teams |
| Notification Templates | Customize all system notification templates and delivery channels |
| Canned Responses | Create, edit, organize, and assign canned response libraries to products/agents |
| Custom Fields | Add product-specific fields to the ticket form |
| API & Webhooks | Generate API tokens; configure outbound webhook endpoints |
| Audit Log | Read-only log of all admin and agent actions; exportable |

## 7.2 User Lifecycle Management

### 7.2.1 Onboarding an Agent

6.  Admin navigates to Users & Roles → Invite User.

7.  Enters name, email, role (L1 / L2 / L3 / Team Lead), and product
    assignment.

8.  System sends an invitation email with a one-time login link (valid
    48 hours).

9.  Agent completes profile setup and is added to the relevant product
    queues.

### 7.2.2 Offboarding an Agent

10. Admin navigates to the agent's profile and selects Deactivate
    Account.

11. System auto-reassigns all open tickets from the deactivated agent
    (round-robin or to a nominated agent).

12. Deactivated users retain read access to historical tickets but
    cannot create or update tickets.

13. Account can be reactivated within 30 days; after 30 days it is
    archived.

### 7.2.3 Managing Customer Org Admins

- Customer Org Admins are created by the System Admin on behalf of a new
  customer.

- Org Admin can invite additional users from their own organization
  (employee view only).

- Org Admin cannot change SLA policies, routing rules, or system
  configuration.

## 7.3 Queue & Workload Management

- Admins and Team Leads can rebalance open tickets across agents via
  drag-and-drop reassignment.

- Out-of-office mode: agent can mark themselves OOO for a date range;
  their tickets auto-redistribute.

- Max ticket cap: optionally set a maximum concurrent open-ticket count
  per agent; overflow goes to team queue.

- Queue health view: shows per-agent open ticket count, oldest open
  ticket, and SLA risk count.

## 7.4 Custom Fields

Admins can add product-specific custom fields to the ticket form without
engineering work. Supported field types:

- Text (single line / multi-line)

- Number

- Date / Date-time

- Dropdown (single or multi-select)

- Checkbox

- File upload

Custom fields can be marked required or optional, and can be shown only
to agents (internal) or to customers as well.

## 7.5 Audit & Compliance

### 7.5.1 Ticket Audit Trail

- Every state change, assignment change, field edit, and comment
  addition is recorded with actor, timestamp, and old/new values.

- Audit trail is immutable — no actor (including Admin) can edit or
  delete audit records.

- Exportable as PDF or CSV for compliance reviews.

### 7.5.2 Admin Audit Log

- All Admin Panel configuration changes are logged: who changed what,
  from what value, to what value, at what time.

- Retained for 24 months.

### 7.5.3 Data Retention & Deletion

- Closed tickets retained for 36 months by default (configurable per
  organization: 12–72 months).

- PII fields (salary amounts, bank details) are masked in data exports
  and logs.

- DPDP Act 2023 right-to-erasure: customer data deletion processed
  within 30 days of account termination request.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 8</strong></p>
<p><strong>Notifications &amp; Communications</strong></p></td>
</tr>
</tbody>
</table>

# 8. Notifications & Communications

Effective notifications keep all stakeholders informed at the right time
without creating noise. This chapter defines the full notification
matrix and the communication standards for ETS.

## 8.1 Notification Matrix

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Event** | **Customer** | **Agent** | **Team Lead** | **Admin** | **Channel** |
| Ticket created | Email | In-app | — | — | Email + In-app |
| Ticket assigned to agent | — | Email+App | — | — | Email + In-app |
| Agent reply added | Email+App | — | — | — | Email + In-app |
| Customer reply added | — | Email+App | — | — | Email + In-app |
| Status changed | Email+App | In-app | — | — | Email + In-app |
| Pending timeout (48h) | Email | Email+App | — | — | Email + In-app |
| SLA warning (75%) | — | Email+App | Email+App | — | Email + In-app |
| SLA breached | — | Email+App | Email+App | Email | Email + In-app |
| Ticket escalated | Email | Email+App | In-app | — | Email + In-app |
| Ticket resolved | Email+CSAT | In-app | — | — | Email + In-app |
| CSAT score ≤ 2 stars | — | In-app | Email+App | — | Email + In-app |
| Ticket reopened | — | Email+App | Email+App | — | Email + In-app |

## 8.2 Email-to-Ticket

Customers can raise and update tickets directly via email, without
visiting the portal. This is the fallback channel for customers who
prefer email.

- Each product has a dedicated inbound support email address (e.g.,
  payroll-support@ezii.com).

- Inbound emails create a new ticket automatically with the email
  subject as the ticket subject and body as the description.

- Subsequent email replies from the same sender are threaded into the
  existing open ticket.

- CC'd recipients on the original email are added as ticket followers
  (receive updates but cannot reply).

- Attachments in emails are automatically attached to the ticket.

## 8.3 Notification Preferences

- Customers can set preferences: All events \| Replies only \|
  Resolution only \| None.

- Agents can configure digest mode: individual alerts or hourly digest
  during business hours.

- Team Leads receive SLA warning and breach alerts by default; this
  cannot be disabled.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 9</strong></p>
<p><strong>Dashboards</strong></p></td>
</tr>
</tbody>
</table>

# 9. Dashboards

ETS provides role-specific dashboards that give each user the
operational data most relevant to their job. All dashboards refresh
every 60 seconds by default; Team Leads can switch to a 10-second
real-time mode.

## 9.1 Agent Dashboard

Displayed immediately upon login. Focused on personal productivity and
task management.

|  |  |
|----|----|
| **Widget** | **Description** |
| My Open Tickets | Count and list of all tickets currently assigned to the agent, sorted by SLA deadline |
| SLA Risk Counter | Number of my tickets in breach-warning state (orange) or breached (red) |
| Pending Customer Reply | Tickets in Pending status where the customer has not responded in 24+ hours |
| Today's Activity | Tickets opened, resolved, and replied to today by this agent |
| Recent Tickets | Last 10 tickets touched, with quick-click to open any of them |
| Team Queue Size | Unassigned ticket count in each product queue this agent covers |

## 9.2 Team Lead Dashboard

Comprehensive operational view for monitoring team performance and SLA
health in real time.

|  |  |
|----|----|
| **Widget** | **Description** |
| SLA Health Heatmap | Visual grid of all open tickets colour-coded by SLA status: green (on track), amber (warning), red (breached) |
| Ticket Volume by Product | Bar chart: open ticket count per product (Payroll / Leave / Attendance / Expense) |
| Agent Workload | Per-agent card showing: open tickets, avg response time today, CSAT, SLA breach count |
| Escalation Funnel | Sankey-style diagram showing tickets flowing from L1 → L2 → L3 |
| Oldest Open Tickets | Top 10 longest-open tickets with owner, product, and age in business hours |
| CSAT Trend | 7-day rolling average CSAT score with breakdown by product |
| Resolution Rate Today | Tickets resolved vs. opened today; net queue change (positive = shrinking) |
| Breach Alert Feed | Live feed of tickets that have breached or are approaching breach in the next 30 minutes |

## 9.3 Management / Executive Dashboard

High-level operational summary for leadership. Focused on trends, KPIs,
and strategic signals.

|  |  |
|----|----|
| **Widget** | **Description** |
| SLA Attainment % | Monthly and weekly SLA attainment rate (First Response and Resolution), with trend sparkline |
| MTTR by Product | Mean Time to Resolution per product, current month vs. previous month |
| Volume Trend | Line chart: daily ticket creation over the last 30 days, broken down by product |
| Top Issue Categories | Ranked list of the 10 most common ticket categories across all products this month |
| CSAT Score | Overall rolling 30-day CSAT with product breakdown and month-on-month delta |
| Escalation Rate | % of tickets escalated from L1 to L2 or L3, by product and over time |
| Open Tickets by Age | Stacked bar: tickets grouped by age bucket (\< 1 day, 1–3 days, 3–7 days, \> 7 days) |

## 9.4 Customer Dashboard (Portal Home)

Simplified summary view visible to customers on their portal home
screen.

- Open tickets count with status breakdown (Open, Pending, Escalated).

- Recently resolved tickets (last 5, with resolution date and summary).

- CSAT prompt: if any resolved tickets have not yet been rated, a prompt
  is shown.

- Service status banner: any active platform incidents relevant to the
  customer's subscribed products.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 10</strong></p>
<p><strong>Reports</strong></p></td>
</tr>
</tbody>
</table>

# 10. Reports

ETS provides a structured reporting suite for scheduled delivery and
ad-hoc analysis. All reports can be exported in PDF, Excel, or CSV
format. Access is role-gated — agents see their own data; Team Leads see
team data; Admins see all.

## 10.1 Standard Reports

### 10.1.1 Daily Operations Digest

Audience: Team Lead, Admin \| Delivery: Email, 8 AM on every business
day

- Overnight ticket volume: tickets created, resolved, and net queue
  change since previous day's close.

- P1 / P2 open tickets: full list with age, assignee, and SLA status.

- SLA breaches in the last 24 hours: ticket ID, product, priority,
  breach duration, and responsible agent.

- Pending tickets past 48 hours (customer has not responded).

### 10.1.2 Weekly Performance Summary

Audience: Team Lead, Admin \| Delivery: Email, Monday 8 AM

- Ticket volume: created, resolved, and backlog trend for the past 7
  days.

- SLA attainment: first response and resolution SLA % by priority tier
  and product.

- Top 5 ticket categories for the week across all products.

- Agent scorecards: tickets handled, avg response time, resolution rate,
  and CSAT per agent.

- Escalation summary: L1→L2 and L2→L3 counts and escalation rate by
  product.

### 10.1.3 Monthly Executive Report

Audience: Leadership, Admin \| Delivery: Email, 1st of each month

- Month-on-month KPIs: volume, MTTR, SLA attainment, and CSAT.

- Product breakdown table: one row per product showing all key metrics
  side by side.

- Top issue themes: ranked categories and sub-categories with trend vs.
  prior month.

- CSAT verbatim highlights: top-rated and lowest-rated customer comments
  (anonymised).

- Escalation analysis: breakdown of escalation reasons and tier
  distribution.

- Recommendations section: automatically flagged anomalies (e.g.,
  'Payroll-Tax tickets up 40% vs. last month').

### 10.1.4 SLA Compliance Report

Audience: Admin, Team Lead \| Delivery: On-demand or scheduled

- Full audit of every ticket that breached an SLA: ticket ID, product,
  priority, SLA type, breach duration, and resolution status.

- SLA attainment % by product, priority, and agent for a selected date
  range.

- Breach pattern analysis: time of day, day of week, and category
  breakdown for breached tickets.

### 10.1.5 Agent Performance Report

Audience: Team Lead, Admin \| Delivery: On-demand or weekly

- Per-agent metrics for a selected period: tickets handled, avg first
  response time, avg resolution time, CSAT, and SLA breach count.

- Comparative ranking table across the team.

- Canned response usage rate (proxy for process adherence).

## 10.2 Custom Report Builder

Admins and Team Leads can build bespoke reports without engineering
support.

- Drag-and-drop column selector: choose any combination of ticket
  fields, SLA metrics, agent data, and CSAT scores.

- Group by: product, category, agent, priority, status, date (day / week
  / month).

- Filters: apply any combination of field-level filters (e.g., 'Payroll
  tickets, P2 and above, last 90 days').

- Visualisation: table, bar chart, line chart, or pie chart.

- Save and schedule: save report configuration; set a delivery schedule
  (daily, weekly, monthly) to one or more email recipients.

- Export: PDF, Excel, or CSV on demand.

## 10.3 Data Access & Permissions

|  |  |  |  |  |  |
|----|----|----|----|----|----|
| **Report** | **L1 Agent** | **L2/L3** | **Team Lead** | **Admin** | **Org Admin (Customer)** |
| Daily Digest | Own only | Own only | Full team | Full | Own org only |
| Weekly Summary | Own only | Own only | Full team | Full | Own org only |
| Monthly Executive Report | No | No | Full team | Full | No |
| SLA Compliance Report | Own only | Own only | Full team | Full | Own org only |
| Agent Performance Report | Own only | Own only | Full team | Full | No |
| Custom Report Builder | No | No | Yes | Full | No |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 11</strong></p>
<p><strong>Non-Functional Requirements</strong></p></td>
</tr>
</tbody>
</table>

# 11. Non-Functional Requirements

## 11.1 Performance

- Portal page load time \< 2 seconds on a standard broadband connection
  (10 Mbps+).

- Ticket submission confirmed \< 3 seconds end-to-end.

- Agent workspace list view renders within 1.5 seconds for up to 500
  tickets.

- Dashboard refresh: 60 seconds default; 10-second real-time mode
  available.

- System must support 500 concurrent agent sessions without degradation.

## 11.2 Scalability

- Horizontal scaling to handle 10x current ticket volume without
  architectural changes.

- Database schema designed for up to 5 million tickets with no migration
  required.

- Multi-tenant: each customer organisation is logically isolated; one
  tenant cannot access another's data.

## 11.3 Availability & Reliability

- Target uptime: 99.9% (\< 8.7 hours downtime per year), excluding
  planned maintenance.

- Planned maintenance: Sundays 2 AM – 4 AM IST, with 48-hour advance
  notice.

- Recovery Time Objective (RTO): 1 hour for P1 system incidents.

- Recovery Point Objective (RPO): 15 minutes (continuous replication +
  hourly backups).

## 11.4 Security

- All data encrypted in transit (TLS 1.3) and at rest (AES-256).

- Authentication: SSO (SAML 2.0), OAuth 2.0, or email + OTP. No
  permanent passwords for customers.

- Role-based access control enforced server-side on every API call.

- PII fields (salary data, bank account details) masked in logs,
  exports, and audit records.

- Full audit log of all user actions retained for 24 months.

- VAPT (Vulnerability Assessment and Penetration Testing) conducted
  before go-live and annually thereafter.

## 11.5 Compliance

- DPDP Act 2023 (India) compliant: lawful basis for processing, data
  minimisation, and right to erasure.

- Data residency: all production data stored in Indian data centres (AWS
  Mumbai ap-south-1 or equivalent).

- Customer data deletion processed within 30 days of verified
  termination request.

## 11.6 Accessibility

- Customer portal: WCAG 2.1 Level AA compliant.

- Keyboard-navigable interface throughout; screen-reader compatible
  (ARIA labels on all interactive elements).

- Minimum contrast ratio of 4.5:1 for all body text; 3:1 for large text
  and UI components.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 12</strong></p>
<p><strong>Implementation Roadmap</strong></p></td>
</tr>
</tbody>
</table>

# 12. Implementation Roadmap

The ETS is delivered in five sequential phases. Each phase is
independently usable and delivers tangible value before the next phase
begins.

|  |  |  |  |
|----|----|----|----|
| **Phase** | **Name** | **Timeline** | **Key Deliverables** |
| 1 | Foundation | Months 1–2 | Core ticket CRUD, product categories, agent workspace, email-to-ticket, RBAC, email notifications, Chat Widget (in-app ticket creation) |
| 2 | SLA & Escalation | Month 3 | SLA policy engine, breach detection, L1/L2/L3 escalation workflow, SLA dashboard |
| 3 | Self-Service Portal | Month 4 | Customer portal, ticket tracking, conversation thread, CSAT survey, announcements banner |
| 4 | Reporting & Analytics | Months 5–6 | All standard reports, custom report builder, management dashboard, scheduled report delivery |
| 5 | Advanced Capabilities | Month 7+ | AI ticket classification, WhatsApp notifications, predictive SLA breach alerts, mobile optimisation |

## 12.1 Phase 1 — Foundation (Months 1–2)

- Core ticket CRUD: create, view, update, and close tickets with all
  standard fields.

- Chat Widget: floating FAB embedded across all Ezii modules; full
  ticket creation including attachments; context metadata passing; My
  Tickets list and ticket detail view within widget.

- Product taxonomy: all four products with default categories and
  sub-categories.

- Basic agent workspace: queue view, ticket detail, reply composer,
  internal notes.

- Email-to-ticket ingestion: one inbound address per product; reply
  threading.

- Role-based access control: Customer, L1 Agent, Team Lead, System
  Admin.

- Email and in-app notifications for core lifecycle events.

## 12.2 Phase 2 — SLA & Escalation (Month 3)

- SLA policy engine: P1–P4 tiers, business hours, and holiday calendar
  integration.

- SLA timer on every ticket; breach warning at 75%; auto-escalation on
  breach.

- L1/L2/L3 escalation workflow with structured handoff note form.

- Keyword-based P1 auto-escalation on ticket creation.

- SLA real-time dashboard for Team Leads.

## 12.3 Phase 3 — Self-Service Portal (Month 4)

- Customer portal: ticket creation, status tracking, conversation
  thread, and file attachments.

- SSO and OTP authentication for customers.

- CSAT survey on resolution; low-CSAT alert to Team Lead.

- Announcements banner for service notices.

## 12.4 Phase 4 — Reporting & Analytics (Months 5–6)

- All six standard reports (daily digest, weekly summary, monthly
  executive, SLA compliance, agent performance, KB effectiveness).

- Custom report builder with drag-and-drop columns, grouping, and
  scheduling.

- Management and executive dashboard with all widgets from Section 8.3.

- Agent and Team Lead dashboards with all widgets from Sections 8.1 and
  8.2.

## 12.5 Phase 5 — Advanced Capabilities (Month 7+)

- AI-powered ticket classification: auto-suggest category, sub-category,
  and priority from the ticket description.

- AI canned response suggestions: surface the most relevant canned
  response based on ticket context.

- WhatsApp Business API: opt-in customer notifications for status
  updates and resolution.

- Predictive SLA breach alerts: ML model flags tickets likely to breach
  before the 75% threshold.

- Mobile-responsive portal optimisation and progressive web app (PWA)
  support.

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 13</strong></p>
<p><strong>Risks &amp; Open Questions</strong></p></td>
</tr>
</tbody>
</table>

# 13. Risks & Open Questions

## 13.1 Risk Register

|  |  |  |  |
|----|----|----|----|
| **Risk** | **Likelihood** | **Impact** | **Mitigation** |
| Adoption resistance from support team | Medium | High | Involve agents in design sprints; run champion agent programme; provide training |
| Admins setting SLAs that engineering cannot honour | Medium | High | Two-tier model: Tier 1 configurable within bounds; Tier 2 hardcoded by Ezii — customers cannot influence internal engineering timers |
| Scope creep delaying Phase 1 | High | High | Strict MVP scope gate; fortnightly sprint reviews with product and engineering leads |
| Email threading failures (mis-matched threads) | Medium | Medium | Email fingerprinting + ticket ID in subject; fallback to new ticket creation |
| Security breach exposing payroll PII | Low | Critical | AES-256 at rest, TLS 1.3 in transit, PII masking, VAPT pre-launch, quarterly audits |
| Data migration from legacy email threads | Low | Low | Optional import tool; not blocking go-live; historical data remains in email |

## 13.2 Open Questions

|  |  |  |  |  |
|----|----|----|----|----|
| **\#** | **Question** | **Owner** | **Needed By** | **Status** |
| Q1 | Should SLA policies be configurable per customer organization in v1.0? Resolved: two-tier model adopted — Tier 1 (customer-facing) is configurable within bounds; Tier 2 (internal Ezii) is hardcoded. | Product Lead | Apr 2026 | Resolved |
| Q2 | What is the expected steady-state ticket volume per product per day? (Drives infrastructure and queue sizing) | Support Ops | Apr 2026 | Open |
| Q3 | Will the customer portal require Hindi or other regional language support at launch? | Product Lead | Apr 2026 | Open |
| Q4 | Should agents be able to merge duplicate tickets, and if so, how should SLA be handled for the surviving ticket? | Support Lead | May 2026 | Open |
| Q5 | What is the agreed data retention period for closed tickets? (Impacts storage architecture and cost estimates) | Legal / CTO | Apr 2026 | Open |
| Q6 | Should ticket IDs be globally unique (EZI-00123) or product-prefixed (PAY-00123)? Product-prefixed is proposed. | Product Lead | Apr 2026 | Open |
| Q7 | Is there a requirement to support multi-org customers (one company with multiple Ezii tenant accounts)? | Sales / Product | May 2026 | Open |

<table>
<colgroup>
<col style="width: 100%" />
</colgroup>
<tbody>
<tr>
<td><p><strong>CHAPTER 14</strong></p>
<p><strong>Glossary</strong></p></td>
</tr>
</tbody>
</table>

# 14. Glossary

|  |  |
|----|----|
| **Term** | **Definition** |
| Chat Widget | A floating in-app panel embedded in the Ezii application that allows customers to raise and manage support tickets from any screen without navigating away |
| Context Metadata | Diagnostic information (e.g., payroll period, employee ID, screen state) automatically attached to a ticket when it is raised via the Chat Widget |
| DPDP Act | Digital Personal Data Protection Act 2023 (India) — governs collection and use of personal data |
| Deflection | A ticket that was not submitted because the customer found an answer in the knowledge base |
| ETS | Ezii Ticketing System — the product defined in this document |
| L1 / L2 / L3 | Support tier levels: L1 Frontline Agent / L2 Product Specialist / L3 Engineering |
| MTTR | Mean Time to Resolution — average time from ticket creation to Closed status |
| OOO | Out of Office — agent availability mode that auto-redistributes their tickets |
| PRD | Product Requirements Document — this document |
| RBAC | Role-Based Access Control — access permissions determined by the user's assigned role |
| RPO | Recovery Point Objective — maximum acceptable data loss window (15 minutes for ETS) |
| RTO | Recovery Time Objective — maximum acceptable downtime following an incident (1 hour for P1) |
| SLA — Tier 1 | Customer-facing SLA: committed first-response and resolution targets visible to clients; configurable by Ezii Admins within defined bounds |
| SLA — Tier 2 | Internal Ezii SLA: hardcoded response and resolution targets for L2 and L3 engineering work; not visible or configurable by customers or customer admins |
| SSO | Single Sign-On — federated authentication allowing login with an existing identity provider |
| VAPT | Vulnerability Assessment and Penetration Testing — mandatory security review before go-live |
| Webhook | An HTTP callback sent by ETS to an external URL when a specified event occurs |

*End of Document — Ezii Ticketing System PRD v1.0 \| March 2026*
