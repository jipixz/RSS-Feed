import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsUrl } from 'class-validator';
import { DiscoverService } from './discover.service';

class AnalyzeDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  url!: string;
}

@Controller('discover')
export class DiscoverController {
  constructor(private readonly discover: DiscoverService) {}

  @Get()
  suggested() {
    return this.discover.suggested();
  }

  @Post('analyze')
  analyze(@Body() body: AnalyzeDto) {
    return this.discover.analyze(body.url);
  }
}
