import { IsBoolean, IsIn, IsOptional } from 'class-validator';

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
  @IsIn(['ai', 'dev', 'sql', 'sec'])
  folder?: string;
}
