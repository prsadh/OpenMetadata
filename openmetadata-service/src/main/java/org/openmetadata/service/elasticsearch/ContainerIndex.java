package org.openmetadata.service.elasticsearch;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Predicate;
import org.openmetadata.schema.entity.data.Container;
import org.openmetadata.schema.type.Column;
import org.openmetadata.schema.type.TagLabel;
import org.openmetadata.service.Entity;
import org.openmetadata.service.util.FullyQualifiedName;
import org.openmetadata.service.util.JsonUtils;

public class ContainerIndex {
  private static final List<String> excludeFields = List.of("changeDescription");

  final Container container;

  public ContainerIndex(Container container) {
    this.container = container;
  }

  public Map<String, Object> buildESDoc() {
    Map<String, Object> doc = JsonUtils.getMap(container);
    List<ElasticSearchSuggest> suggest = new ArrayList<>();
    List<ElasticSearchSuggest> columnSuggest = new ArrayList<>();
    List<ElasticSearchSuggest> serviceSuggest = new ArrayList<>();
    List<TagLabel> tags = new ArrayList<>();
    ElasticSearchIndexUtils.removeNonIndexableFields(doc, excludeFields);
    suggest.add(ElasticSearchSuggest.builder().input(container.getFullyQualifiedName()).weight(5).build());
    suggest.add(ElasticSearchSuggest.builder().input(container.getName()).weight(10).build());
    if (container.getDataModel() != null && container.getDataModel().getColumns() != null) {
      List<FlattenColumn> cols = new ArrayList<>();
      parseColumns(container.getDataModel().getColumns(), cols, null);

      for (FlattenColumn col : cols) {
        if (col.getTags() != null) {
          tags.addAll(col.getTags());
        }
        columnSuggest.add(ElasticSearchSuggest.builder().input(col.getName()).weight(5).build());
      }
    }
    tags.addAll(ElasticSearchIndexUtils.parseTags(container.getTags()));
    serviceSuggest.add(ElasticSearchSuggest.builder().input(container.getService().getName()).weight(5).build());
    ParseTags parseTags = new ParseTags(tags);

    doc.put("displayName", container.getDisplayName() != null ? container.getDisplayName() : container.getName());
    doc.put("tags", parseTags.tags);
    doc.put("tier", parseTags.tierTag);
    doc.put("followers", ElasticSearchIndexUtils.parseFollowers(container.getFollowers()));
    doc.put("suggest", suggest);
    doc.put("service_suggest", serviceSuggest);
    doc.put("column_suggest", columnSuggest);
    doc.put("entityType", Entity.CONTAINER);
    doc.put("serviceType", container.getServiceType());
    return doc;
  }

  private void parseColumns(List<Column> columns, List<FlattenColumn> flattenColumns, String parentColumn) {
    Optional<String> optParentColumn = Optional.ofNullable(parentColumn).filter(Predicate.not(String::isEmpty));
    List<TagLabel> tags = new ArrayList<>();
    for (Column col : columns) {
      String columnName = col.getName();
      if (optParentColumn.isPresent()) {
        columnName = FullyQualifiedName.add(optParentColumn.get(), columnName);
      }
      if (col.getTags() != null) {
        tags = col.getTags();
      }

      FlattenColumn flattenColumn = FlattenColumn.builder().name(columnName).description(col.getDescription()).build();

      if (!tags.isEmpty()) {
        flattenColumn.tags = tags;
      }
      flattenColumns.add(flattenColumn);
      if (col.getChildren() != null) {
        parseColumns(col.getChildren(), flattenColumns, col.getName());
      }
    }
  }
}
