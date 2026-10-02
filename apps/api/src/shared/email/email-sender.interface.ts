export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

export interface EmailSender {
  sendInvitation(input: {
    to: string;
    tenantName: string;
    invitationUrl: string;
    expiresAt: Date;
  }): Promise<void>;
}
