from algorithms.matching.bf.bf_matching import match_sift

def match_sift_bidirectional(descriptors_moving, descriptors_reference, lowe_ratio=0.75):
    """
    Lowe-ratio matching in both directions.
    
    A correspondence is retained only if:
      moving[i] -> reference[j]
    and
      reference[j] -> moving[i]
      
    both pass the Lowe ratio test.
    """
    _, forward = match_sift(descriptors_moving, descriptors_reference, lowe_ratio)
    _, reverse = match_sift(descriptors_reference, descriptors_moving, lowe_ratio)

    reverse_pairs = {
        (m.queryIdx, m.trainIdx)
        for m in reverse
    }

    mutual = [
        m for m in forward
        if (m.trainIdx, m.queryIdx) in reverse_pairs
    ]

    return forward, reverse, mutual
