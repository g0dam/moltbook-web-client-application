import type { Locale } from './config';
import en from './messages/en';
import type { MessageSchema } from './messages/en';
import zh from './messages/zh';

export type Messages = MessageSchema;

export function getMessages(locale: Locale): Messages {
  switch (locale) {
    case 'zh':
      return zh;
    case 'en':
    default:
      return en;
  }
}
