import { IsBoolean, IsOptional, Matches } from 'class-validator';

export class SetReadDto {
  @IsBoolean()
  read!: boolean;
}

export class SetStarDto {
  @IsBoolean()
  starred!: boolean;
}

export class MarkAllReadDto {
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,30}$/)
  folder?: string;
}
