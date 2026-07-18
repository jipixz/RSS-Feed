import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class ListArticlesQueryDto {
  @IsOptional()
  @Matches(/^[a-z0-9-]{1,30}$/)
  folder?: string;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  saved?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 30;
}
