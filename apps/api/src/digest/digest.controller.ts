import { Controller, Get, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DigestService } from './digest.service';

class DigestQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(168)
  hours: number = 24;
}

@Controller('digest')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @Get()
  get(@Query() query: DigestQueryDto) {
    return this.digest.digest(query.hours);
  }
}
