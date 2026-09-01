import { Controller, Get, Param, ParseUUIDPipe, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { Policy } from "../../common/policy/policy.decorator";
import { Policies } from "../../common/policy/policy.types";
import { CatalogService } from "./catalog.service";
import {
  CategoryQueryDto,
  LocationQueryDto,
  SkillQueryDto,
} from "./dto/catalog-query.dto";

@ApiTags("catalog")
@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get("categories")
  @Policy(Policies.public())
  getCategories(@Query() query: CategoryQueryDto) {
    return this.catalog.getCategories(query.tree === "true");
  }

  @Get("categories/:id/skills")
  @Policy(Policies.public())
  getCategorySkills(@Param("id", new ParseUUIDPipe()) categoryId: string) {
    return this.catalog.getSkills(categoryId);
  }

  @Get("skills")
  @Policy(Policies.public())
  getSkills(@Query() query: SkillQueryDto) {
    return this.catalog.getSkills(query.categoryId, query.q);
  }

  @Get("locations")
  @Policy(Policies.public())
  getLocations(@Query() query: LocationQueryDto) {
    return this.catalog.getLocations(query.parentId, query.type);
  }
}
