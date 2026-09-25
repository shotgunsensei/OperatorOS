MSP RESOLUTION CLOSEOUT PACK
Canonical Production Prompt

PURPOSE

When instructed to "Run Ticket Completion Prompt", analyze the entire troubleshooting incident contained in the current conversation or supplied ticket context and transform it into a complete MSP incident closeout package.

Use the full troubleshooting history, not merely the final successful action.

Capture:
- Initial symptoms
- User impact
- Environment
- Devices/assets
- Applications/services involved
- Error messages and error codes
- Commands and scripts executed
- Diagnostic evidence
- Hypotheses considered
- Actions attempted
- Actions that failed
- Actions that succeeded
- Side effects
- Risks discovered
- Root cause
- Confidence in root cause
- Final resolution
- Validation performed
- Remaining validation
- Prevention opportunities
- Monitoring opportunities
- Automation opportunities
- Escalation criteria
- Reusable intellectual property opportunities

Do not invent missing facts.

Clearly distinguish:
- Confirmed facts
- Strongly supported conclusions
- Hypotheses
- Unverified possibilities
- Pending validation

Preserve important technical details including:
- Hostnames
- Operating-system versions/builds
- Application versions
- Service names
- File paths
- Registry paths
- IP addresses
- Ports
- Error codes
- Event IDs
- Commands
- Relevant timestamps
- File sizes
- Configuration values

Do not expose passwords, API keys, tokens, private keys, recovery keys, or other authentication secrets.

If sensitive credentials appear in the troubleshooting history, replace them with "[REDACTED]".

Use professional MSP documentation suitable for:
- Service-ticket closure
- Internal engineering documentation
- Knowledge-base creation
- Technician training
- Future AI retrieval
- Evidence capture
- Automation design

==================================================
REQUIRED OUTPUT
==================================================

1. INCIDENT METADATA

Include when known:
- Incident title
- Client/organization
- Device name
- User
- Location
- Date
- Technician
- Platform
- OS/version/build
- Applications involved
- Services involved
- Network context
- Severity
- Business impact
- Current status

2. EXECUTIVE RESOLUTION SUMMARY

Provide a concise technical-management summary explaining:
- What happened
- What was affected
- What was discovered
- Root cause
- What fixed it
- Current state
- Any remaining follow-up

3. CLIENT-FACING RESOLUTION SUMMARY

Write a concise non-technical explanation appropriate for the client/end user.

Do not overload the client-facing summary with unnecessary commands, logs, or internal engineering details.

4. SERVICE TICKET RESOLUTION NOTES

Create technician-ready ticket notes containing:
- Issue
- Symptoms
- Diagnostic findings
- Actions performed
- Errors encountered
- Root cause
- Resolution
- Validation
- Follow-up

Make this suitable for direct copy/paste into an MSP ticketing platform.

5. INTERNAL MSP ENGINEERING REPORT

Produce a chronological technical reconstruction of the incident.

Include:
- Initial state
- Troubleshooting progression
- Evidence observed
- Why specific diagnostic branches were pursued
- Failed remediation attempts
- Successful remediation
- Unexpected side effects
- Recovery from side effects
- Final technical state

Do not omit failed actions simply because they did not contribute to the final fix.

6. ROOT CAUSE ANALYSIS

Include:
- Primary root cause
- Contributing conditions
- Secondary effects
- Evidence supporting the conclusion
- Root-cause confidence
- Factors not proven to be causal

Use a confidence level of:
- CONFIRMED
- HIGH
- MODERATE
- LOW
- UNKNOWN

Explain the evidence supporting the assigned confidence.

7. KNOWLEDGE BASE ARTICLE

Create a reusable KB article with:
- Title
- Applies to
- Symptoms
- Indicators
- Cause
- Diagnostic procedure
- Resolution
- Verification
- Warnings
- Prevention
- Related error codes
- Tags

The KB article must be generalized so another technician can use it on another endpoint.

8. RAPID TECHNICIAN RUNBOOK

Create a shortened operational runbook for technicians who encounter the issue again.

Structure it as:
- Identify
- Confirm
- Diagnose
- Remediate
- Validate
- Escalate

Highlight dangerous actions and actions that caused adverse side effects.

9. COMMANDS / SCRIPTS REFERENCE

List commands and scripts used during the incident.

For each command where possible include:
- Purpose
- Command
- Expected result
- Actual result during this incident
- Whether it was diagnostic or corrective
- Risk level

Do not fabricate commands that were not used unless clearly labeled as a recommended future command.

10. TROUBLESHOOTING LESSONS LEARNED

Document:
- What worked
- What failed
- What produced misleading evidence
- What caused side effects
- What could have been done earlier
- What future technicians should avoid
- What shortened the troubleshooting path

Failure intelligence is important. Preserve failed approaches.

11. PREVENTION / MONITORING RECOMMENDATIONS

Identify practical opportunities for:
- RMM monitors
- Event-log monitoring
- Disk-space monitoring
- Service-state monitoring
- Configuration validation
- Patch compliance
- Security monitoring
- Proactive remediation

Provide thresholds when the incident evidence supports them.

12. AUTOMATION OPPORTUNITY

Evaluate whether all or part of the incident can become:
- RMM monitor
- RMM component
- PowerShell remediation
- Health check
- Scheduled maintenance
- TechDeck automation
- OperatorOS workflow

Include:
- Automation name
- Trigger
- Inputs
- Diagnostic logic
- Safe automated actions
- Actions requiring technician approval
- Exit codes
- Expected output
- Risks
- Estimated technician time saved if reasonably inferable

Never recommend automatic destructive remediation when human validation is required.

13. TECHNICIAN ESCALATION INTELLIGENCE

Document conditions under which a technician should stop standard troubleshooting and escalate.

Include relevant escalation targets such as:
- Senior engineer
- Network engineer
- Security
- Vendor
- Application support
- Hardware replacement
- Windows repair/in-place upgrade

14. CLASSIFICATION / METADATA

Generate normalized metadata including:
- Category
- Subcategory
- Severity
- Cause type
- Affected platform
- Affected applications
- Affected services
- Error codes
- Event IDs
- Tags
- Security relevance
- Hardware relevance
- Network relevance
- Automation candidate
- KB candidate
- Recurrence risk

15. FINAL ONE-LINE RESOLUTION

Provide one technically accurate sentence describing the issue and its resolution.

16. REUSABLE INTELLECTUAL PROPERTY OPPORTUNITIES

Determine whether this incident can produce reusable organizational IP such as:
- Knowledge article
- RMM component
- Diagnostic script
- Monitoring rule
- Automation
- TechDeck module
- Training scenario
- Troubleshooting decision tree
- Vendor-specific runbook
- Detection signature

17. INCIDENT CLOSURE STATUS

Include:
- Primary remediation: COMPLETE / INCOMPLETE
- User functionality: RESTORED / DEGRADED / UNKNOWN
- Validation: COMPLETE / PARTIAL / PENDING
- Monitoring required: YES / NO
- Follow-up required: YES / NO
- Recommended ticket state
- Outstanding actions

==================================================
MACHINE-READABLE EVIDENCE EXPORT
==================================================

After the human-readable report, ALWAYS append one final section labeled exactly:

MACHINE_EVIDENCE_EXPORT

The section must contain valid JSON only.

Do not place comments inside the JSON.

Do not omit the section.

Use this schema:

{
  "schema_version": "1.0",
  "export_type": "msp_incident_closeout",
  "incident": {
    "incident_id": null,
    "external_ticket_id": null,
    "title": null,
    "organization": null,
    "client": null,
    "technician": null,
    "opened_at": null,
    "closed_at": null,
    "status": null,
    "severity": null,
    "business_impact": null
  },
  "affected_assets": [
    {
      "asset_type": null,
      "hostname": null,
      "device_name": null,
      "manufacturer": null,
      "model": null,
      "serial_number": null,
      "operating_system": null,
      "os_version": null,
      "os_build": null,
      "ip_addresses": [],
      "mac_addresses": [],
      "role": null
    }
  ],
  "environment": {
    "domain": null,
    "tenant": null,
    "network": null,
    "location": null,
    "applications": [],
    "services": [],
    "vendors": []
  },
  "issue": {
    "summary": null,
    "symptoms": [],
    "user_reported_symptoms": [],
    "technician_observed_symptoms": [],
    "error_codes": [],
    "event_ids": [],
    "error_messages": [],
    "affected_components": [],
    "first_observed_at": null
  },
  "evidence": [
    {
      "evidence_id": null,
      "timestamp": null,
      "type": null,
      "source": null,
      "description": null,
      "value": null,
      "units": null,
      "path": null,
      "confidence": null
    }
  ],
  "diagnostics": [
    {
      "sequence": null,
      "timestamp": null,
      "action": null,
      "command": null,
      "purpose": null,
      "expected_result": null,
      "actual_result": null,
      "outcome": null,
      "risk_level": null
    }
  ],
  "commands_scripts": [
    {
      "sequence": null,
      "type": null,
      "language": null,
      "command_or_script": null,
      "purpose": null,
      "result": null,
      "successful": null,
      "destructive": false,
      "requires_elevation": null
    }
  ],
  "changes_made": [
    {
      "sequence": null,
      "timestamp": null,
      "change_type": null,
      "target": null,
      "before": null,
      "after": null,
      "reason": null,
      "reversible": null,
      "rollback": null
    }
  ],
  "failed_actions": [
    {
      "action": null,
      "reason_failed": null,
      "error": null,
      "side_effect": null,
      "lesson": null
    }
  ],
  "successful_actions": [
    {
      "action": null,
      "result": null,
      "evidence": null
    }
  ],
  "side_effects": [
    {
      "triggering_action": null,
      "effect": null,
      "severity": null,
      "recovery_action": null,
      "recovered": null
    }
  ],
  "root_cause": {
    "summary": null,
    "category": null,
    "confidence": null,
    "evidence": [],
    "contributing_factors": [],
    "secondary_effects": [],
    "not_proven": []
  },
  "resolution": {
    "summary": null,
    "final_actions": [],
    "permanent_fix": null,
    "temporary_workaround": null
  },
  "validation": {
    "performed": [],
    "successful": [],
    "failed": [],
    "pending": []
  },
  "current_status": {
    "primary_remediation": null,
    "user_functionality": null,
    "validation": null,
    "monitoring_required": null,
    "follow_up_required": null,
    "recommended_ticket_state": null
  },
  "follow_up": [
    {
      "action": null,
      "priority": null,
      "owner": null,
      "due": null
    }
  ],
  "classification": {
    "category": null,
    "subcategory": null,
    "cause_type": null,
    "platforms": [],
    "applications": [],
    "services": [],
    "technologies": [],
    "tags": [],
    "security_relevant": null,
    "hardware_relevant": null,
    "network_relevant": null,
    "kb_candidate": null,
    "automation_candidate": null,
    "recurrence_risk": null
  },
  "automation_opportunity": {
    "candidate": null,
    "name": null,
    "trigger": null,
    "inputs": [],
    "diagnostic_logic": [],
    "safe_actions": [],
    "approval_required_actions": [],
    "risks": [],
    "estimated_time_savings_minutes": null
  },
  "knowledge": {
    "kb_title": null,
    "one_line_resolution": null,
    "warnings": [],
    "lessons_learned": [],
    "escalation_conditions": [],
    "reusable_ip_opportunities": []
  },
  "artifact_log_references": [
    {
      "type": null,
      "name": null,
      "path_or_reference": null,
      "description": null
    }
  ],
  "security": {
    "credentials_present": false,
    "credentials_redacted": true,
    "security_incident_suspected": null,
    "security_notes": null
  },
  "data_quality": {
    "overall_confidence": null,
    "missing_important_information": [],
    "conflicting_information": [],
    "assumptions": []
  }
}

RULES FOR MACHINE_EVIDENCE_EXPORT:

- Output syntactically valid JSON.
- Preserve exact error codes, hostnames, paths, versions, ports, and commands when known.
- Use null when a scalar value is unknown.
- Use [] when an array has no known entries.
- Do not invent information to populate fields.
- Confidence values must be one of:
  CONFIRMED
  HIGH
  MODERATE
  LOW
  UNKNOWN
- Outcome values should preferably be:
  SUCCESS
  FAILURE
  PARTIAL
  INCONCLUSIVE
  NOT_RUN
- Risk levels should preferably be:
  NONE
  LOW
  MEDIUM
  HIGH
  CRITICAL
- Redact credentials and secrets.
- Preserve failed actions and adverse side effects.
- Preserve chronology where available.
- The MACHINE_EVIDENCE_EXPORT should contain enough structured information for another system to reconstruct the incident without parsing the prose report.
