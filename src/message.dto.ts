// DTO for FCM push notification request
import { IsString, IsOptional, IsArray } from 'class-validator';

export class MessageDto {
  @IsString()
  title: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsString()
  token?: string;       // Single device token

  @IsOptional()
  @IsString()
  topic?: string;       // FCM topic for broadcast

  @IsOptional()
  @IsArray()
  tokens?: string[];    // Multiple device tokens

  @IsOptional()
  data?: Record<string, string>;
}
