import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_SENDER, EmailSender } from './email-sender.interface';
import { MailpitEmailSender } from './mailpit-email-sender.service';
import { ResendEmailSender } from './resend-email-sender.service';

@Module({
  providers: [
    ResendEmailSender,
    MailpitEmailSender,
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService, ResendEmailSender, MailpitEmailSender],
      useFactory: (
        config: ConfigService,
        resendEmailSender: ResendEmailSender,
        mailpitEmailSender: MailpitEmailSender,
      ): EmailSender => {
        const provider = config.get<string>('MAIL_PROVIDER')
          ?? (config.get<string>('NODE_ENV') === 'development' ? 'mailpit' : 'resend');
        return provider === 'mailpit' ? mailpitEmailSender : resendEmailSender;
      },
    },
  ],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}