import { Controller, Get, Query } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { SearchService } from './search.service';

class SearchQueryDto {
  @IsString()
  @Length(1, 500) // el servicio trunca a 200 — selecciones largas no deben dar 400
  q!: string;
}

@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  /** Respuesta rápida (DuckDuckGo Instant Answers). */
  @Get('ddg')
  ddg(@Query() query: SearchQueryDto) {
    return this.search.ddg(query.q);
  }

  /** Referencia detallada (Wikipedia es→en). */
  @Get('wikipedia')
  wikipedia(@Query() query: SearchQueryDto) {
    return this.search.wikipedia(query.q);
  }
}
