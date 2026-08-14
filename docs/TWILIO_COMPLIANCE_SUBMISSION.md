# OperatorOS Twilio Compliance Submission

Use this text after the referenced URLs are deployed and independently confirmed public. Do not submit a URL as live until it returns the deployed compliance page over HTTPS.

## BUSINESS WEBSITE

https://operatoros.net/

## PRIVACY POLICY URL

https://operatoros.net/privacy

## TERMS AND CONDITIONS URL

https://operatoros.net/terms

## OPT-IN / CALL-TO-ACTION URL

https://operatoros.net/sms-consent

## MESSAGING PROGRAM INFORMATION URL

https://operatoros.net/messaging

## CAMPAIGN DESCRIPTION

OperatorOS sends service-related SMS messages to users who have explicitly opted in. Messages may include account and security notifications, scheduled-call notifications, support communications, service and workflow/status updates, and other operational messages specifically requested by the user. OperatorOS does not send messages under this service program to users who have not provided the appropriate consent. This program does not include marketing or promotional SMS consent.

## MESSAGE FLOW / HOW DO END USERS CONSENT?

End users opt in by visiting https://operatoros.net/sms-consent and entering their US mobile phone number. The user must actively select a separate, unchecked SMS-consent checkbox agreeing to receive OperatorOS service SMS communications. The checkbox is not selected by default. SMS consent is optional and is not required to browse the website, create an account, purchase a service, use core OperatorOS functionality, or accept the OperatorOS Terms and Conditions. The visible disclosure states that message frequency varies, message and data rates may apply, users may reply STOP to opt out or HELP for help, and consent is not a condition of purchase. The form links directly to the OperatorOS Privacy Policy and Terms and Conditions. OperatorOS records the normalized phone number, UTC consent timestamp, program/status, source URL, exact disclosure text and version, policy versions, opt-in mechanism, and privacy-preserving request evidence. Revocation and permitted re-enrollment events are retained separately.

## SAMPLE MESSAGE 1

OperatorOS: Your requested support workflow [reference] has been updated to [status]. Sign in to OperatorOS for details. Reply STOP to unsubscribe.

## SAMPLE MESSAGE 2

OperatorOS: Your scheduled OperatorOS call for [date/time] is ready. Reply STOP to unsubscribe.

## OPT-IN KEYWORDS

Not used for initial enrollment. Users opt in through the public OperatorOS web consent form at https://operatoros.net/sms-consent. START may be honored only as an opt-back-in mechanism for a number that previously opted out where supported by the configured Twilio sender workflow.

## OPT-IN CONFIRMATION MESSAGE

OperatorOS: You are subscribed to OperatorOS service messages. Message frequency varies. Message and data rates may apply. Reply STOP to unsubscribe or HELP for help.

## OPT-OUT KEYWORDS

STOP, UNSUBSCRIBE, END, QUIT, STOPALL, REVOKE, OPTOUT, CANCEL

## OPT-OUT

Users can reply STOP to unsubscribe. Standard Twilio-supported opt-out keywords are honored. OperatorOS records revocation evidence when the signed provider workflow supplies it and applies a local outbound suppression check without bypassing Twilio or carrier suppression. An opted-out recipient will not receive additional messages from this messaging program unless the recipient subsequently provides new consent or opts back in through an allowed mechanism.

## OPT-OUT CONFIRMATION MESSAGE

OperatorOS: You have been unsubscribed and will receive no further messages from this program.

## HELP KEYWORDS

HELP

## HELP

Users can reply HELP for assistance. They may also email john@shotgunninjas.com or use https://operatoros.net/john.

## HELP MESSAGE

OperatorOS: Help is available at operatoros.net/john or john@shotgunninjas.com. Reply STOP to unsubscribe.

## MESSAGE FREQUENCY

Message frequency varies based on user activity, scheduled communications, and requested OperatorOS services.

## MESSAGE AND DATA RATES

Message and data rates may apply.

## CONSENT CONDITION

Consent to receive SMS messages is not a condition of purchasing goods or services.

## PRIVACY / MOBILE DATA SHARING

OperatorOS does not sell or rent SMS consent. Mobile information and messaging consent are not shared with third parties or affiliates for their own marketing or promotional purposes. Service providers may process information strictly as necessary to operate the communications service where legally appropriate. The public Privacy Policy contains the carrier-required non-sharing statement.

## NUMBER AND MESSAGING SERVICE NOTE

The source implementation currently sends shared outbound SMS with a direct Twilio `From` number and contains no Messaging Service SID configuration. The signed direct-number inbound callback for that sender is `https://callcommand-ai.operatoros.net/v1/modules/callcommand-ai/webhooks/twilio/messaging`. Before submission, the owner must confirm the actual production sender type in Twilio Console and choose the applicable A2P 10DLC and/or Toll-Free Verification path. If the sender is attached to a Messaging Service, confirm Advanced Opt-Out configuration and the live STOP/HELP/START responses there. Do not claim external registration approval until Twilio shows the corresponding verified status.

## VOICE NOTE

OperatorOS SMS consent is separate from CallCommand/OutCall voice consent and verified-self calling controls. Twilio Voice Trust Hub, STIR/SHAKEN, CNAM, calling registration, and any automated/prerecorded-call consent requirements must be handled and verified separately.
