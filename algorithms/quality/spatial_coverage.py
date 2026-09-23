def calculate_spatial_coverage(points, image_shape, grid_rows=6, grid_cols=6):
    """
    Calculate the percentage of grid cells occupied by at least one inlier point.
    """
    height, width = image_shape[:2]
    occupied_cells = set()

    for point in points.reshape(-1, 2):
        x, y = point

        col = min(int(x / (width / grid_cols)), grid_cols - 1)
        row = min(int(y / (height / grid_rows)), grid_rows - 1)
        occupied_cells.add((row, col))

    total_cells = grid_rows * grid_cols
    coverage = (len(occupied_cells) / total_cells) * 100.0

    return coverage, occupied_cells
