// One reminder email per overdue loan. Runs once per item.
const loan = $input.item.json;
const appUrl = $env.LENDLOOP_APP_URL || 'http://localhost:3000';
const from = { Email: $env.LENDLOOP_MAIL_FROM || 'notifications@lendloop.local', Name: 'LendLoop' };
const days = loan.daysOverdue === 1 ? '1 day' : `${loan.daysOverdue} days`;

return {
  json: {
    ...loan,
    mail: {
      From: from,
      To: [{ Email: loan.borrower.email, Name: loan.borrower.firstName }],
      Subject: `Reminder: the ${loan.toolName} is ${days} overdue`,
      Text:
        `Hi ${loan.borrower.firstName},\n\n` +
        `The ${loan.toolName} you borrowed from ${loan.lender.firstName} was due back on ${loan.endDate} ` +
        `(${days} ago). Please return it or get in touch with them.\n\n${appUrl}/requests\n\nLendLoop`,
      Tags: ['lendloop', 'overdue-reminder'],
    },
  },
};
