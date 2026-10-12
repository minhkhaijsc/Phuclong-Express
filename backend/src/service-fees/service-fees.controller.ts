import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ServiceFeesService } from './service-fees.service';
import { ServiceFee } from './entities/service-fee.entity';
import { CreateServiceFeeDto } from './dto/create-service-fee.dto';
import { UpdateServiceFeeDto } from './dto/update-service-fee.dto';
import { QueryServiceFeeDto } from './dto/query-service-fee.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { MienQuyen } from '../auth/quyen/quyen.decorator';
/**
 * Service Fees Controller
 *
 * Handles service fee CRUD endpoints.
 *
 * Endpoints:
 * - GET /service-fees - List service fees with filters
 * - GET /service-fees/:id - Get service fee by ID
 * - POST /service-fees - Create new service fee
 * - PUT /service-fees/:id - Update service fee
 * - DELETE /service-fees/:id - Delete service fee
 */
@Controller('service-fees')
@MienQuyen('danhMuc')
export class ServiceFeesController {
  constructor(private readonly serviceFeesService: ServiceFeesService) {}

  /**
   * GET /service-fees
   * List service fees with filters and pagination
   */
  @Get()
  async findAll(
    @Query() query: QueryServiceFeeDto,
  ): Promise<{ data: ServiceFee[]; total: number; page: number; limit: number }> {
    return this.serviceFeesService.findAll(query);
  }

  /**
   * GET /service-fees/:id
   * Get service fee by ID
   */
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ServiceFee> {
    return this.serviceFeesService.findOne(id);
  }

  /**
   * POST /service-fees
   * Create new service fee
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createServiceFeeDto: CreateServiceFeeDto,
    @Request() req: any,
  ): Promise<ServiceFee> {
    return this.serviceFeesService.create(createServiceFeeDto, req.user?.username || 'system');
  }

  /**
   * PUT /service-fees/:id
   * Update service fee
   */
  @UseGuards(JwtAuthGuard)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceFeeDto: UpdateServiceFeeDto,
    @Request() req: any,
  ): Promise<ServiceFee> {
    return this.serviceFeesService.update(id, updateServiceFeeDto, req.user?.username || 'system');
  }

  /**
   * DELETE /service-fees/:id
   * Delete service fee
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: any,
  ): Promise<void> {
    return this.serviceFeesService.remove(id, req.user?.username || 'system');
  }
}
