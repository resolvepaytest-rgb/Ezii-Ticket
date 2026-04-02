**Ezii Ticketing System Table Schema ERD  **

ORGANISATION {

integer id

string name

string support_email

string timezone

datetime created_at

datetime updated_at

}

ORGANISATION_SETTING {

integer id

string organisation_id

string business_hours_definition

string holiday_calendar

string is_ngo

int ticket_retention_months

}

PRODUCT {

integer id

string name

string code

string default_ticket_prefix

}

ORGANISATION_PRODUCT {

integer id

string organisation_id

string product_id

string default_routing_queue_id

boolean enabled

}

USER {

integer id

string organisation_id

string name

string email

string phone

string user_type

string status

datetime created_at

datetime updated_at

}

ROLE {

integer id

string name

string description

}

USER_ROLE {

integer id

string user_id

string role_id

string scope_organisation_id

datetime created_at

}

TEAM {

integer id

string name

string product_id

string tier

string organisation_id

}

TEAM_MEMBER {

integer id

string team_id

string user_id

boolean is_team_lead

int max_open_tickets_cap

}

CATEGORY {

integer id

string product_id

string name

string description

boolean is_active

}

SUBCATEGORY {

integer id

string category_id

string name

string description

boolean is_active

}

QUEUE {

integer id

string name

string product_id

string team_id

string organisation_id

}

SLA_POLICY_TIER1 {

integer id

string organisation_id

string priority

int first_response_target_minutes

int resolution_target_minutes

boolean visible_to_customer

}

SLA_POLICY_TIER2 {

integer id

string priority

int l2_ack_minutes

int l2_resolution_or_pass_to_l3_minutes

int l3_ack_minutes

int l3_resolution_minutes

}

TICKET {

integer id

string organisation_id

string ticket_number

string product_id

string category_id

string subcategory_id

string reporter_id

string assignee_id

string queue_id

string status

string priority

string channel

int affected_users_count

string sla_policy_tier1_id

string sla_policy_tier2_id

datetime created_at

datetime updated_at

datetime first_response_at

datetime resolved_at

datetime closed_at

datetime escalated_at

datetime cancelled_at

}

CUSTOM_FIELD {

integer id

string product_id

string name

string code

string field_type

boolean is_required

boolean is_customer_visible

string config_options

}

TICKET_CUSTOM_FIELD {

integer id

string ticket_id

string custom_field_id

string value_text

float value_number

datetime value_date

}

TICKET_ATTACHMENT {

integer id

string ticket_id

string uploaded_by_id

string file_name

string file_url

string mime_type

int size_bytes

datetime created_at

}

TICKET_TAG {

integer id

string ticket_id

string tag_value

datetime created_at

}

TICKET_FOLLOWER {

integer id

string ticket_id

string user_id

datetime created_at

}

TICKET_MESSAGE {

integer id

string ticket_id

string sender_id

string sender_role_snapshot

string channel

string body_richtext

boolean is_internal_note

datetime created_at

}

TICKET_STATUS_HISTORY {

integer id

string ticket_id

string previous_status

string new_status

string changed_by_id

string change_reason

datetime created_at

}

TICKET_SLA_TIMER {

integer id

string ticket_id

int tier

string priority_snapshot

datetime target_first_response_at

datetime target_resolution_at

datetime started_at

datetime paused_from

int total_paused_minutes

datetime breach_warning_at

datetime breached_at

}

ROUTING_RULE {

integer id

string organisation_id

string name

int priority_order

boolean is_active

}

ROUTING_RULE_CONDITION {

integer id

string routing_rule_id

string field

string operator

string value

}

ROUTING_RULE_ACTION {

integer id

string routing_rule_id

string action_type

string action_value

}

KEYWORD_TRIGGER {

integer id

string product_id

string phrase

boolean is_active

}

ESCALATION {

integer id

string ticket_id

string from_tier

string to_tier

string initiated_by_id

string trigger_type

datetime created_at

}

ESCALATION_HANDOFF_NOTE {

integer id

string escalation_id

string issue_summary

string steps_to_reproduce

string impact_description

string what_has_been_tried

string target_team_id

string target_user_id

string escalation_reason

}

NOTIFICATION_TEMPLATE {

integer id

string event_type

string default_channels

string subject_template

string body_template

boolean is_editable_by_customer_admin

}

NOTIFICATION {

integer id

string user_id

string ticket_id

string event_type

string channel

string template_id

string delivery_status

datetime created_at

datetime read_at

}

CSAT_RESPONSE {

integer id

string ticket_id

string respondent_id

int rating

string comment_text

datetime submitted_at

}

TICKET_AUDIT_TRAIL {

integer id

string ticket_id

string actor_id

string action_type

string field_name

string old_value

string new_value

datetime created_at

}

ADMIN_AUDIT_LOG {

integer id

string actor_id

string section

string action_type

string target_id

string old_value

string new_value

datetime created_at

}

DATA_RETENTION_POLICY {

integer id

string organisation_id

int closed_ticket_retention_months

int audit_log_retention_months

string pi_masking_rules

}

%% Relationships

ORGANISATION \|\|--o{ USER : has

ORGANISATION \|\|--o{ ORGANISATION_SETTING : configures

ORGANISATION \|\|--o{ ORGANISATION_PRODUCT : enables

ORGANISATION \|\|--o{ QUEUE : owns

ORGANISATION \|\|--o{ SLA_POLICY_TIER1 : defines

ORGANISATION \|\|--o{ DATA_RETENTION_POLICY : governs

ORGANISATION \|\|--o{ TICKET : owns

PRODUCT \|\|--o{ ORGANISATION_PRODUCT : is_enabled_for

PRODUCT \|\|--o{ CATEGORY : has

PRODUCT \|\|--o{ QUEUE : routes_to

PRODUCT \|\|--o{ CUSTOM_FIELD : uses

CATEGORY \|\|--o{ SUBCATEGORY : has

CATEGORY \|\|--o{ TICKET : classifies

SUBCATEGORY \|\|--o{ TICKET : refines

USER \|\|--o{ USER_ROLE : has

ROLE \|\|--o{ USER_ROLE : assigned_to

TEAM \|\|--o{ TEAM_MEMBER : includes

USER \|\|--o{ TEAM_MEMBER : joins

QUEUE \|\|--o{ TICKET : contains

TEAM \|\|--o{ QUEUE : owns

SLA_POLICY_TIER1 \|\|--o{ TICKET : applied_to

SLA_POLICY_TIER2 \|\|--o{ TICKET : applied_to

TICKET \|\|--o{ TICKET_MESSAGE : has

TICKET \|\|--o{ TICKET_ATTACHMENT : has

TICKET \|\|--o{ TICKET_TAG : tagged_with

TICKET \|\|--o{ TICKET_FOLLOWER : followed_by

TICKET \|\|--o{ TICKET_STATUS_HISTORY : changes

TICKET \|\|--o{ TICKET_SLA_TIMER : timers

TICKET \|\|--o{ ESCALATION : escalates

TICKET \|\|--o{ CSAT_RESPONSE : rated_by

TICKET \|\|--o{ TICKET_AUDIT_TRAIL : audited_by

USER \|\|--o{ TICKET : reports

USER \|\|--o{ TICKET : assigned

ESCALATION \|\|--\|\| ESCALATION_HANDOFF_NOTE : documents

ROUTING_RULE \|\|--o{ ROUTING_RULE_CONDITION : has

ROUTING_RULE \|\|--o{ ROUTING_RULE_ACTION : executes

ORGANISATION \|\|--o{ ROUTING_RULE : defines

PRODUCT \|\|--o{ KEYWORD_TRIGGER : triggers

NOTIFICATION_TEMPLATE \|\|--o{ NOTIFICATION : instantiates

USER \|\|--o{ NOTIFICATION : receives

TICKET \|\|--o{ NOTIFICATION : notifies

USER \|\|--o{ ADMIN_AUDIT_LOG : changes
