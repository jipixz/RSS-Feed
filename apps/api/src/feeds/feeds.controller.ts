import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { IsUrl, Matches } from 'class-validator';
import { FeedsService } from './feeds.service';

class CreateFeedDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;

  @Matches(/^[a-z0-9-]{1,30}$/)
  folderKey!: string;
}

@Controller('feeds')
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @Get()
  list() {
    return this.feeds.list();
  }

  @Post()
  create(@Body() body: CreateFeedDto) {
    return this.feeds.create(body.url, body.folderKey);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.feeds.remove(id);
  }
}
