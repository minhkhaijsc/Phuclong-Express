import { Controller, Get, Query, Post, Body, UseGuards } from '@nestjs/common';
import { SystemLogsService } from './system-logs.service';
import type { QuerySystemLogsDto } from './system-logs.service';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
@Controller('system-logs')
@MienQuyen('nhatKy')
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  /**
   * GET /system-logs - Get system logs with filters
   */
  @Get()
  async findAll(@Query() query: QuerySystemLogsDto) {
    return this.systemLogsService.findAll(query);
  }

  /**
   * POST /system-logs - Create a new system log entry
   */
  @Post()
  async create(@Body() createDto: {
    nguoiTao: string;
    nguon: string;
    hanhDong: string;
    doiTuong: string;
    noiDung: string;
  }) {
    return this.systemLogsService.create(createDto);
  }
}