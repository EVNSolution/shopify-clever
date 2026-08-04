export function getOrdersPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_value, index) => index + 1);
  }

  let start = Math.max(2, currentPage - 1);
  let end = Math.min(totalPages - 1, currentPage + 1);

  if (currentPage <= 3) {
    start = 2;
    end = Math.min(4, totalPages - 1);
  } else if (currentPage >= totalPages - 2) {
    start = Math.max(2, totalPages - 3);
    end = totalPages - 1;
  }

  const visiblePages = [1];
  if (start > 2) visiblePages.push(`ellipsis-${start}`);
  for (let page = start; page <= end; page += 1) visiblePages.push(page);
  if (end < totalPages - 1) visiblePages.push(`ellipsis-${totalPages}`);
  visiblePages.push(totalPages);
  return visiblePages;
}
