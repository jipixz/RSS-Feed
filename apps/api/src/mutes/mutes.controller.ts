import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { MutesService } from './mutes.service';

class AddMuteDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(1, 60)
  term!: string;
}

@Controller('mutes')
export class MutesController {
  constructor(private readonly mutes: MutesService) {}

  @Get()
  list() {
    return this.mutes.list();
  }

  @Post()
  add(@Body() body: AddMuteDto) {
    return this.mutes.add(body.term);
  }

  @Delete(':term')
  remove(@Param('term') term: string) {
    return this.mutes.remove(decodeURIComponent(term));
  }
}
