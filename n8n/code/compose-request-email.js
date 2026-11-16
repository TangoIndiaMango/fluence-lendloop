// Turn a verified request-status event into an email. Only the fields
// Convex sent are used: first names, tool name, dates, one address.
const event = $input.first().json.event;
const appUrl = $env.LENDLOOP_APP_URL || 'http://localhost:3000';
const from = { Email: $env.LENDLOOP_MAIL_FROM || 'notifications@lendloop.local', Name: 'LendLoop' };

const fmt = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const dates =
  event.loan.startDate === event.loan.endDate
    ? fmt(event.loan.startDate)
    : `${fmt(event.loan.startDate)} to ${fmt(event.loan.endDate)}`;
const tool = event.tool.name;
const other = event.counterpart.firstName;
const reason = event.reason ? ` (${event.reason})` : '';

const templates = {
  'request.created': [
    `${other} would like to borrow your ${tool}`,
    `${other} asked to borrow your ${tool} for ${dates}.\n\nApprove or decline: ${appUrl}/incoming`,
  ],
  'request.cancelled': [
    `${other} withdrew their request for your ${tool}`,
    `${other} no longer needs your ${tool} for ${dates}. Nothing to do.`,
  ],
  'request.approved': [
    `You can borrow the ${tool}`,
    `${other} approved your request for the ${tool} (${dates}).\n\nTheir contact details are now on your request: ${appUrl}/requests`,
  ],
  'request.declined': [
    `Your request for the ${tool} was declined`,
    `Your request for the ${tool} (${dates}) was declined${reason}.\n\nOther tools: ${appUrl}/browse`,
  ],
  'loan.returned': [
    `Thanks for returning the ${tool}`,
    `${other} marked the ${tool} as returned. Thanks for borrowing responsibly!`,
  ],
};

const template = templates[event.type];
if (!template) throw new Error(`Unknown event type: ${event.type}`);
const [subject, text] = template;

return [
  {
    json: {
      eventId: event.eventId,
      mail: {
        From: from,
        To: [{ Email: event.recipient.email, Name: event.recipient.firstName }],
        Subject: subject,
        Text: `Hi ${event.recipient.firstName},\n\n${text}\n\nLendLoop`,
        Tags: ['lendloop', event.type],
      },
    },
  },
];
